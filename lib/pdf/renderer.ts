import PDFDocument from "pdfkit";
import {
  ALL_FONT_NAMES,
  ARABIC_SIZE_SCALE,
  fontBuffer,
  fontMetrics,
  resolveFontName,
  type FontName,
} from "./fonts";
import { shortFileName } from "@/lib/attachments/file-types";
import {
  PLAIN_STYLE,
  buildAtoms,
  baseLevel,
  drawableText,
  reorderAtoms,
  type Atom,
  type ChipAtom,
  type InlineStyle,
  type Segment,
  type TextAtom,
} from "./bidi-text";
import type { Dictionary } from "@/lib/i18n/dictionaries";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export interface RenderAttachment {
  id: string;
  /** Unique display name shown on the chip. */
  fileName: string;
  /**
   * Absolute URL of this attachment's viewer, e.g.
   * `https://app.example.com/attachments/<id>`.
   *
   * An absolute web link is the only target a PDF chip can have that a phone can
   * follow: tapping it hands off to the browser. Relative file paths cannot work
   * (mobile viewers get a sandboxed `content://` handle with no sibling folder),
   * embedded files need an attachments pane that Chrome and Edge do not have, and
   * `data:` URIs are blocked from top-level navigation by every browser.
   */
  href: string;
  description: string;
  size: number;
  pageCount: number;
  blockIds: string[];
  convertedFromImage: boolean;
  originalFileName: string;
}

interface TreeNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TreeNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

/** A chip's position, so the merge step can turn it into an internal jump. */
export interface ChipLink {
  attachmentId: string;
  pageIndex: number;
  rect: [number, number, number, number];
}

export interface RenderedReport {
  bytes: Buffer;
  /** Populated in annex mode only. */
  chipLinks: ChipLink[];
}

export interface RenderInput {
  title: string;
  subtitle: string;
  direction: "rtl" | "ltr";
  content: unknown;
  attachments: RenderAttachment[];
  dictionary: Dictionary;
  locale: "en" | "ar";
  authorName: string;
  generatedAt: Date;
  footerText: string;
  pageSize: "A4" | "LETTER";
  /**
   * Annex mode, used for phones. The chip becomes an internal jump instead of a
   * web link, and the merge step appends each attachment's own pages after the
   * report — no cover pages, no list, no added section: the report reads exactly
   * as it does otherwise, with the evidence sitting behind it like exhibits behind
   * a pleading.
   *
   * Mobile PDF viewers cannot reach a sibling file or an embedded attachment, so
   * pages inside the same file are the only thing a tap can resolve offline.
   */
  annex?: boolean;
}

/* -------------------------------------------------------------------------- */
/* Design constants — mirrors the on-screen editor                            */
/* -------------------------------------------------------------------------- */

const PAGE_SIZES = {
  A4: { width: 595.28, height: 841.89 },
  LETTER: { width: 612, height: 792 },
} as const;

const MARGIN = { top: 62, bottom: 66, left: 64, right: 64 };

const COLOR = {
  ink: "#1a1c1c",
  inkSoft: "#444748",
  inkFaint: "#747878",
  line: "#c4c7c7",
  lineSoft: "#e5e5e5",
  surface: "#f3f3f3",
  chip: "#eeeeee",
  evidence: "#0050cc",
} as const;

const BODY_SIZE = 11;
const HEADING_SIZES: Record<number, number> = { 1: 18, 2: 14.5, 3: 12.5, 4: 11.5 };

/** Leading multipliers. Arabic needs more room for ascenders and descenders. */
const LEADING = { arabic: 1.78, latin: 1.5 };
const BASELINE_RATIO = { arabic: 1.1, latin: 0.96 };

/**
 * A chip is a reference inside a sentence, not a card: small enough to read as
 * an annotation to the text. Kept in step with the `.chip` rules in globals.css
 * so the editor previews the printed result.
 */
const CHIP = {
  fontSize: 6.4,
  paddingX: 4,
  gap: 2.4,
  iconWidth: 5.4,
  height: 11.2,
  radius: 5.6,
};

/** Characters of a file name shown on a chip, including its extension. */
const CHIP_NAME_LENGTH = 10;

/* -------------------------------------------------------------------------- */
/* Line model                                                                 */
/* -------------------------------------------------------------------------- */

interface Line {
  atoms: Atom[];
  width: number;
  /** Largest drawn font size on the line, used for the line box. */
  maxSize: number;
  hasArabic: boolean;
  /** Number of inter-word gaps available for justification. */
  gaps: number;
}

interface ParagraphOptions {
  fontSize: number;
  bold?: boolean;
  align?: "left" | "center" | "right" | "justify";
  direction: "rtl" | "ltr";
  color?: string;
  indent?: number;
  /** Extra space above/below the block. */
  spaceBefore?: number;
  spaceAfter?: number;
  /** Chips to append at the end of the last chunk. */
  chips?: RenderAttachment[];
}

/**
 * PDFKit's bundled types predate a few features this renderer relies on
 * (`AFRelationship` on embedded files, arbitrary annotation dictionaries, raw
 * catalog access), so those calls go through this widened view of the document.
 */
type PdfDoc = InstanceType<typeof PDFDocument> & {
  file(
    src: Buffer,
    options: {
      name: string;
      description?: string;
      type?: string;
      relationship?: string;
      creationDate?: Date;
      modifiedDate?: Date;
      hidden?: boolean;
    },
  ): unknown;
  annotate(
    x: number,
    y: number,
    width: number,
    height: number,
    options: Record<string, unknown>,
  ): PdfDoc;
  ref(data: Record<string, unknown>): { end(content?: string): void };
  _root: { data: Record<string, unknown> };
};

/* -------------------------------------------------------------------------- */
/* Renderer                                                                   */
/* -------------------------------------------------------------------------- */

class ReportRenderer {
  private readonly doc: PdfDoc;
  private readonly page: { width: number; height: number };
  private readonly contentWidth: number;
  private y: number;
  private readonly rtl: boolean;
  private readonly t: Dictionary;
  private readonly chipsByBlock = new Map<string, RenderAttachment[]>();
  private readonly chipLinks: ChipLink[] = [];
  private pageCount = 0;
  private readonly input: RenderInput;

  constructor(input: RenderInput) {
    this.input = input;
    this.page = PAGE_SIZES[input.pageSize];
    this.rtl = input.direction === "rtl";
    this.t = input.dictionary;
    this.contentWidth = this.page.width - MARGIN.left - MARGIN.right;

    this.doc = new PDFDocument({
      size: [this.page.width, this.page.height],
      margins: MARGIN,
      bufferPages: true,
      autoFirstPage: false,
      pdfVersion: "1.7",
      lang: input.locale,
      // With no title there is nothing to display, so let readers fall back to
      // the file name rather than showing an empty window title.
      displayTitle: Boolean(input.title.trim()),
      // Every value here is written verbatim into the Info dictionary, so no
      // key may be present with an undefined value.
      info: {
        Author: input.authorName || "Lexis",
        Creator: "Lexis",
        Producer: "Lexis",
        CreationDate: input.generatedAt,
        ...(input.title.trim() ? { Title: input.title.trim() } : {}),
        ...(input.subtitle.trim() ? { Subject: input.subtitle.trim() } : {}),
      },
    }) as PdfDoc;

    for (const name of ALL_FONT_NAMES) {
      this.doc.registerFont(name, fontBuffer(name));
    }


    this.y = MARGIN.top;
  }

  /* ------------------------------------------------------------------ build */

  /**
   * The exported report contains the report and nothing else — no appended
   * evidence pages, no attachments index. It has to read like a document a
   * lawyer would file. 
   */
  async build(): Promise<RenderedReport> {
    this.indexAttachments();

    this.addPage();
    this.drawDocumentHeading();

    const root = this.input.content as TreeNode;
    const blocks = Array.isArray(root?.content) ? root.content : [];
    for (const block of blocks) this.drawFlowNode(block, 0, this.input.direction);

    if (this.input.annex && this.input.attachments.length > 0) {
      this.drawAttachmentsDivider();
    }
    this.drawPageFurniture();

    return {
      bytes: await this.finish(),
      chipLinks: this.chipLinks,
    };
  }

  private finish(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      this.doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      this.doc.on("end", () => resolve(Buffer.concat(chunks)));
      this.doc.on("error", reject);
      this.doc.end();
    });
  }

  /* ------------------------------------------------------------ attachments */

  private indexAttachments(): void {
    for (const attachment of this.input.attachments) {
      for (const blockId of attachment.blockIds) {
        const list = this.chipsByBlock.get(blockId);
        if (list) list.push(attachment);
        else this.chipsByBlock.set(blockId, [attachment]);
      }
    }
  }

  /* ------------------------------------------------------------------- page */

  private get bottomLimit(): number {
    return this.page.height - MARGIN.bottom;
  }

  private addPage(): void {
    this.doc.addPage({
      size: [this.page.width, this.page.height],
      margins: MARGIN,
    });
    this.pageCount += 1;
    this.y = MARGIN.top;
  }

  private ensureSpace(height: number): void {
    if (this.y + height <= this.bottomLimit) return;
    this.addPage();
  }

  /* ------------------------------------------------------------------ fonts */

  private fontFor(
    style: InlineStyle,
    script: "arabic" | "latin",
    forceBold = false,
  ): FontName {
    return resolveFontName({
      script,
      weight: style.bold || forceBold ? "bold" : "regular",
      style: style.italic ? "italic" : "normal",
      sans: style.code,
    });
  }

  /**
   * The serif pair needs a size correction; the sans family covers both scripts
   * in one design, so it is used at its nominal size.
   */
  private sizeFor(
    script: "arabic" | "latin",
    size: number,
    sans = false,
  ): number {
    return script === "arabic" && !sans ? size * ARABIC_SIZE_SCALE : size;
  }

  private measure(atom: Omit<TextAtom, "width">, fontSize: number): number {
    const name = this.fontFor(atom.style, atom.script);
    const size = this.sizeFor(atom.script, fontSize, atom.style.code);
    this.doc.font(name).fontSize(size);
    return this.doc.widthOfString(drawableText(atom as TextAtom));
  }

  /**
   * Lays out a short single-line label (chip text, markers) through the same
   * bidi pipeline as body text, truncating with an ellipsis when needed.
   */
  private sansLabel(
    text: string,
    size: number,
    direction: "rtl" | "ltr",
    maxWidth: number,
    sans = true,
  ): { atoms: TextAtom[]; width: number } {
    const build = (value: string) => {
      const atoms = buildAtoms(
        [{ text: value, style: { ...PLAIN_STYLE, code: sans } }],
        direction,
      ).map<TextAtom>((atom) => ({
        ...atom,
        width: this.measure(atom, size),
      }));
      return {
        atoms,
        width: atoms.reduce((sum, atom) => sum + atom.width, 0),
      };
    };

    let result = build(text);
    if (result.width <= maxWidth) return result;

    // Trim from the logical end until the ellipsis version fits.
    let trimmed = text;
    while (trimmed.length > 4 && result.width > maxWidth) {
      trimmed = trimmed.slice(0, -1);
      result = build(`${trimmed}…`);
    }
    return result;
  }

  private chipLabelMaxWidth(): number {
    return 190;
  }

  /**
   * Draws one short sans line at an exact position, through the bidi pipeline.
   * Used for page furniture and chip labels — never PDFKit's own text flow,
   * which knows nothing about bidi and would also paginate behind our back.
   */
  private drawSansLine(
    text: string,
    size: number,
    direction: "rtl" | "ltr",
    x: number,
    baseline: number,
    color: string,
    maxWidth = Number.MAX_SAFE_INTEGER,
    sans = true,
  ): number {
    const label = this.sansLabel(text, size, direction, maxWidth, sans);
    let cursor = x;
    for (const atom of reorderAtoms(label.atoms)) {
      this.doc
        .font(this.fontFor(atom.style, atom.script))
        .fontSize(this.sizeFor(atom.script, size, sans))
        .fillColor(color)
        .text(drawableText(atom), cursor, baseline, {
          lineBreak: false,
          baseline: "alphabetic",
        });
      cursor += atom.width;
    }
    return label.width;
  }

  private chipLabel(attachment: RenderAttachment): string {
    return shortFileName(attachment.fileName, CHIP_NAME_LENGTH);
  }

  private chipWidth(label: string): number {
    const measured = this.sansLabel(
      label,
      CHIP.fontSize,
      this.input.direction,
      this.chipLabelMaxWidth(),
    );
    return CHIP.paddingX * 2 + CHIP.iconWidth + CHIP.gap + measured.width + 1;
  }

  /* ------------------------------------------------------------------ lines */

  private layout(
    segments: Segment[],
    availableWidth: number,
    options: ParagraphOptions,
    chips: RenderAttachment[] = [],
  ): Line[] {
    const raw = buildAtoms(segments, options.direction);
    const measured: Atom[] = raw.map((atom) => ({
      ...atom,
      width: this.measure(atom, options.fontSize),
    }));

    for (const attachment of chips) {
      const label = this.chipLabel(attachment);
      measured.push({
        kind: "chip",
        attachmentId: attachment.id,
        label,
        level: baseLevel(options.direction),
        isSpace: false,
        width: this.chipWidth(label),
      } satisfies ChipAtom);
      // A thin space before each chip keeps it off the last word.
      measured.splice(measured.length - 1, 0, {
        kind: "text",
        text: " ",
        level: baseLevel(options.direction),
        script: options.direction === "rtl" ? "arabic" : "latin",
        style: PLAIN_STYLE,
        isSpace: true,
        reverse: false,
        width: this.measure(
          {
            kind: "text",
            text: " ",
            level: 0,
            script: "latin",
            style: PLAIN_STYLE,
            isSpace: true,
            reverse: false,
          },
          options.fontSize,
        ),
      });
    }

    const lines: Line[] = [];
    let current: Atom[] = [];
    let currentWidth = 0;
    let pending: Atom[] = [];
    let pendingWidth = 0;

    const flush = () => {
      if (current.length === 0) return;
      lines.push(this.finishLine(current, currentWidth, options.fontSize));
      current = [];
      currentWidth = 0;
      pending = [];
      pendingWidth = 0;
    };

    for (const atom of measured) {
      if (atom.isSpace) {
        if (current.length === 0) continue; // drop leading whitespace
        pending.push(atom);
        pendingWidth += atom.width;
        continue;
      }

      // A single unbreakable atom wider than the column has to be split.
      const pieces =
        atom.kind === "text" && atom.width > availableWidth
          ? this.splitWideAtom(atom, availableWidth, options.fontSize)
          : [atom];

      for (const piece of pieces) {
        if (
          current.length > 0 &&
          currentWidth + pendingWidth + piece.width > availableWidth + 0.01
        ) {
          flush();
        }
        if (current.length > 0) {
          current.push(...pending);
          currentWidth += pendingWidth;
        }
        pending = [];
        pendingWidth = 0;
        current.push(piece);
        currentWidth += piece.width;
      }
    }
    flush();

    return lines;
  }

  private finishLine(atoms: Atom[], width: number, fontSize: number): Line {
    const ordered = reorderAtoms(atoms);
    let maxSize = 0;
    let hasArabic = false;
    let gaps = 0;
    for (const atom of atoms) {
      if (atom.kind === "chip") {
        maxSize = Math.max(maxSize, CHIP.height * 0.72);
        continue;
      }
      if (atom.isSpace) {
        gaps += 1;
        continue;
      }
      if (atom.script === "arabic" && !atom.style.code) hasArabic = true;
      maxSize = Math.max(
        maxSize,
        this.sizeFor(atom.script, fontSize, atom.style.code),
      );
    }
    return {
      atoms: ordered,
      width,
      maxSize: maxSize || fontSize,
      hasArabic,
      gaps,
    };
  }

  private splitWideAtom(
    atom: TextAtom,
    availableWidth: number,
    fontSize: number,
  ): TextAtom[] {
    const characters = [...atom.text];
    const pieces: TextAtom[] = [];
    let buffer = "";

    const push = () => {
      if (!buffer) return;
      const candidate = { ...atom, text: buffer };
      pieces.push({ ...candidate, width: this.measure(candidate, fontSize) });
      buffer = "";
    };

    for (const character of characters) {
      const candidate = { ...atom, text: buffer + character };
      if (buffer && this.measure(candidate, fontSize) > availableWidth) push();
      buffer += character;
    }
    push();
    return pieces.length > 0 ? pieces : [atom];
  }

  /* ------------------------------------------------------------------- draw */

  /** Draws a run of lines, paginating as needed. Returns the height consumed. */
  private drawLines(
    lines: Line[],
    options: ParagraphOptions,
    left: number,
    width: number,
    onFirstLine?: (baseline: number, lineIndex: number) => void,
  ): void {
    lines.forEach((line, index) => {
      const arabic = line.hasArabic;
      const leading = arabic ? LEADING.arabic : LEADING.latin;
      const lineHeight = line.maxSize * leading;
      const baselineOffset =
        line.maxSize * (arabic ? BASELINE_RATIO.arabic : BASELINE_RATIO.latin);

      this.ensureSpace(lineHeight);
      const baseline = this.y + baselineOffset;

      const isLast = index === lines.length - 1;
      this.drawLine(line, options, left, width, baseline, isLast);
      onFirstLine?.(baseline, index);

      this.y += lineHeight;
    });
  }

  private drawLine(
    line: Line,
    options: ParagraphOptions,
    left: number,
    width: number,
    baseline: number,
    isLastLine: boolean,
  ): void {
    const align =
      options.align ?? (options.direction === "rtl" ? "right" : "left");

    let extraPerGap = 0;
    let x = left;

    if (align === "center") {
      x = left + (width - line.width) / 2;
    } else if (align === "right") {
      x = left + width - line.width;
    } else if (align === "justify" && !isLastLine && line.gaps > 0) {
      extraPerGap = Math.max(0, (width - line.width) / line.gaps);
    } else if (align === "left" && options.direction === "rtl") {
      x = left;
    }

    // An RTL paragraph with default alignment starts at the right edge.
    if (!options.align && options.direction === "rtl") {
      x = left + width - line.width;
    }

    for (const atom of line.atoms) {
      if (atom.kind === "chip") {
        this.drawChip(atom, x, baseline);
        x += atom.width;
        continue;
      }
      if (atom.isSpace) {
        x += atom.width + extraPerGap;
        continue;
      }
      this.drawTextAtom(atom, x, baseline, options);
      x += atom.width;
    }
  }

  private drawTextAtom(
    atom: TextAtom,
    x: number,
    baseline: number,
    options: ParagraphOptions,
  ): void {
    const name = this.fontFor(atom.style, atom.script);
    const size = this.sizeFor(atom.script, options.fontSize, atom.style.code);
    const color = atom.style.link
      ? COLOR.evidence
      : (options.color ?? COLOR.ink);

    this.doc
      .font(name)
      .fontSize(size)
      .fillColor(color)
      .text(drawableText(atom), x, baseline, {
        lineBreak: false,
        baseline: "alphabetic",
      });

    const metrics = fontMetrics(name);
    if (atom.style.underline || atom.style.link) {
      const offset = baseline + size * 0.09;
      this.doc
        .save()
        .lineWidth(Math.max(0.4, size * 0.045))
        .strokeColor(color)
        .moveTo(x, offset)
        .lineTo(x + atom.width, offset)
        .stroke()
        .restore();
    }
    if (atom.style.strike) {
      const offset = baseline - (metrics.xHeight / 2) * size;
      this.doc
        .save()
        .lineWidth(Math.max(0.4, size * 0.045))
        .strokeColor(color)
        .moveTo(x, offset)
        .lineTo(x + atom.width, offset)
        .stroke()
        .restore();
    }
    if (atom.style.link) {
      this.doc.link(x, baseline - size * 0.8, atom.width, size * 1.1, atom.style.link);
    }
  }

  /**
   * A compact file chip, matching the reference design and the in-app editor:
   * rounded grey pill, small PDF glyph, file name. The chip doubles as the
   * clickable hot spot of a PDF FileAttachment annotation pointing at the
   * embedded copy of that exact file.
   */
  private drawChip(atom: ChipAtom, x: number, baseline: number): void {
    const height = CHIP.height;
    const top = baseline - height * 0.76;
    const width = atom.width;

    this.doc.save();
    this.doc.roundedRect(x, top, width, height, CHIP.radius).fill(COLOR.chip);

    // Small document glyph.
    const iconX = x + CHIP.paddingX;
    const iconTop = top + (height - 8.4) / 2;
    this.doc
      .lineWidth(0.65)
      .strokeColor(COLOR.inkFaint)
      .roundedRect(iconX, iconTop, CHIP.iconWidth, 8.4, 1)
      .stroke()
      .moveTo(iconX + 1.6, iconTop + 3)
      .lineTo(iconX + CHIP.iconWidth - 1.6, iconTop + 3)
      .moveTo(iconX + 1.6, iconTop + 5.2)
      .lineTo(iconX + CHIP.iconWidth - 2.6, iconTop + 5.2)
      .stroke();
    this.doc.restore();

    // The label goes through the bidi pipeline: an Arabic file name has to be
    // shaped and ordered exactly like body text.
    this.drawSansLine(
      atom.label,
      CHIP.fontSize,
      this.input.direction,
      iconX + CHIP.iconWidth + CHIP.gap,
      top + height / 2 + CHIP.fontSize * 0.34,
      COLOR.inkSoft,
      this.chipLabelMaxWidth(),
    );

    this.linkChipToFile(atom.attachmentId, x, top, width, height);
    this.doc.fillColor(COLOR.ink);
  }

  /**
   * Makes the chip clickable: a link annotation pointing at the attachment's
   * viewer in the application. See `RenderAttachment.href` for why this is a web
   * URL and not a file path, an embedded file, or a data URI.
   */
  private linkChipToFile(
    attachmentId: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const attachment = this.input.attachments.find(
      (item) => item.id === attachmentId,
    );
    if (!attachment) return;

    if (this.input.annex) {
      // Recorded now, wired to the attachment's page once those pages exist.
      this.chipLinks.push({
        attachmentId,
        pageIndex: Math.max(0, this.pageCount - 1),
        // PDF rectangles are measured from the bottom of the page.
        rect: [x, this.page.height - (y + height), x + width, this.page.height - y],
      });
      return;
    }

    if (attachment.href) this.doc.link(x, y, width, height, attachment.href);
  }

  /* -------------------------------------------------------------- documents */

  private drawDocumentHeading(): void {
    // An untitled report prints no title. Inventing a placeholder like
    // "Untitled report" would put a word in the document the author never wrote.
    const title = this.input.title.trim();
    if (title) {
      this.drawParagraph([{ text: title, style: PLAIN_STYLE }], {
        fontSize: 21,
        bold: true,
        direction: this.input.direction,
        spaceAfter: 3,
      });
    }

    const meta: string[] = [];
    if (this.input.subtitle.trim()) meta.push(this.input.subtitle.trim());
    meta.push(
      `${this.t.pdf.generated}: ${formatDate(this.input.generatedAt, this.input.locale)}`,
    );

    this.drawParagraph(
      [{ text: meta.join("  ·  "), style: PLAIN_STYLE }],
      {
        fontSize: 8.6,
        direction: this.input.direction,
        color: COLOR.inkFaint,
        spaceAfter: 10,
      },
      { sans: true },
    );

    this.doc
      .save()
      .lineWidth(0.75)
      .strokeColor(COLOR.line)
      .moveTo(MARGIN.left, this.y)
      .lineTo(this.page.width - MARGIN.right, this.y)
      .stroke()
      .restore();
    this.y += 16;
  }

  private drawParagraph(
    segments: Segment[],
    options: ParagraphOptions,
    extra: { sans?: boolean; left?: number; width?: number } = {},
  ): void {
    const left = extra.left ?? MARGIN.left;
    const width = extra.width ?? this.contentWidth;

    const styled = segments.map<Segment>((segment) => ({
      text: segment.text,
      style: {
        ...segment.style,
        bold: segment.style.bold || Boolean(options.bold),
        code: segment.style.code || Boolean(extra.sans),
      },
    }));

    if (options.spaceBefore) this.y += options.spaceBefore;
    const lines = this.layout(styled, width, options, options.chips ?? []);
    if (lines.length === 0) {
      // Empty paragraph still occupies a line, as it does in the editor.
      this.ensureSpace(options.fontSize * LEADING.latin);
      this.y += options.fontSize * LEADING.latin;
    } else {
      this.drawLines(lines, options, left, width);
    }
    if (options.spaceAfter) this.y += options.spaceAfter;
  }

  /* ------------------------------------------------------------------ nodes */

  private chipsFor(node: TreeNode): RenderAttachment[] {
    const blockId = node.attrs?.blockId;
    if (typeof blockId !== "string") return [];
    return this.chipsByBlock.get(blockId) ?? [];
  }

  private directionOf(node: TreeNode, inherited: "rtl" | "ltr"): "rtl" | "ltr" {
    const dir = node.attrs?.dir;
    return dir === "rtl" || dir === "ltr" ? dir : inherited;
  }

  private alignOf(node: TreeNode): ParagraphOptions["align"] | undefined {
    const align = node.attrs?.textAlign;
    return align === "left" || align === "right" || align === "center" || align === "justify"
      ? align
      : undefined;
  }

  private drawFlowNode(
    node: TreeNode,
    depth: number,
    inheritedDirection: "rtl" | "ltr",
    bounds: { left: number; width: number } = {
      left: MARGIN.left,
      width: this.contentWidth,
    },
  ): void {
    const direction = this.directionOf(node, inheritedDirection);

    switch (node.type) {
      case "paragraph": {
        const chunks = inlineChunks(node);
        chunks.forEach((chunk, index) => {
          const isLast = index === chunks.length - 1;
          this.drawParagraph(
            chunk,
            {
              fontSize: BODY_SIZE,
              direction,
              align: this.alignOf(node),
              spaceAfter: isLast ? BODY_SIZE * 0.62 : 0,
              chips: isLast ? this.chipsFor(node) : [],
            },
            bounds,
          );
        });
        if (chunks.length === 0) {
          this.drawParagraph(
            [],
            {
              fontSize: BODY_SIZE,
              direction,
              spaceAfter: BODY_SIZE * 0.62,
              chips: this.chipsFor(node),
            },
            bounds,
          );
        }
        break;
      }

      case "heading": {
        const level = clampLevel(node.attrs?.level);
        const size = HEADING_SIZES[level];
        const segments = inlineChunks(node).flat();
        // Keep a heading with the text it introduces.
        this.ensureSpace(size * LEADING.arabic + BODY_SIZE * LEADING.arabic * 2);
        this.drawParagraph(
          segments,
          {
            fontSize: size,
            bold: true,
            direction,
            align: this.alignOf(node),
            spaceBefore: level === 1 ? 12 : 10,
            spaceAfter: 5,
            chips: this.chipsFor(node),
          },
          bounds,
        );
        break;
      }

      case "blockquote": {
        const inset = 16;
        const left = direction === "rtl" ? bounds.left : bounds.left + inset;
        const width = bounds.width - inset;
        const startY = this.y;
        const startPage = this.pageCount;
        node.content?.forEach((child) =>
          this.drawFlowNode(child, depth, direction, { left, width }),
        );
        // Rule on the leading edge, only for quotes that stay on one page.
        if (this.pageCount === startPage) {
          const ruleX =
            direction === "rtl" ? bounds.left + bounds.width - 2 : bounds.left + 2;
          this.doc
            .save()
            .lineWidth(2)
            .strokeColor(COLOR.line)
            .moveTo(ruleX, startY)
            .lineTo(ruleX, this.y - BODY_SIZE * 0.5)
            .stroke()
            .restore();
        }
        break;
      }

      case "bulletList":
      case "orderedList":
        this.drawList(node, depth, direction, bounds);
        break;

      case "horizontalRule":
        this.ensureSpace(14);
        this.y += 6;
        this.doc
          .save()
          .lineWidth(0.75)
          .strokeColor(COLOR.lineSoft)
          .moveTo(bounds.left, this.y)
          .lineTo(bounds.left + bounds.width, this.y)
          .stroke()
          .restore();
        this.y += 10;
        break;

      case "table":
        this.drawTable(node, direction, bounds);
        break;

      default:
        // Unknown node types are skipped rather than guessed at.
        node.content?.forEach((child) =>
          this.drawFlowNode(child, depth, direction, bounds),
        );
        break;
    }
  }

  private drawList(
    node: TreeNode,
    depth: number,
    direction: "rtl" | "ltr",
    bounds: { left: number; width: number },
  ): void {
    const ordered = node.type === "orderedList";
    const start = Number(node.attrs?.start ?? 1) || 1;
    const indent = 20;
    const items = node.content ?? [];

    items.forEach((item, index) => {
      const itemDirection = this.directionOf(item, direction);
      const marker = ordered
        ? `${start + index}.`
        : depth % 2 === 0
          ? "•"
          : "◦";

      const innerBounds = {
        left: itemDirection === "rtl" ? bounds.left : bounds.left + indent,
        width: bounds.width - indent,
      };

      const markerY = this.y;
      const markerPage = this.pageCount;

      item.content?.forEach((child, childIndex) => {
        const before = this.y;
        this.drawFlowNode(child, depth + 1, itemDirection, innerBounds);
        if (childIndex === 0 && this.pageCount === markerPage) {
          // Marker sits on the first line of the item, on the leading edge.
          this.drawMarker(marker, itemDirection, bounds, indent, before);
        } else if (childIndex === 0) {
          this.drawMarker(marker, itemDirection, bounds, indent, markerY);
        }
      });
    });
  }

  private drawMarker(
    marker: string,
    direction: "rtl" | "ltr",
    bounds: { left: number; width: number },
    indent: number,
    top: number,
  ): void {
    const script = direction === "rtl" ? "arabic" : "latin";
    const size = this.sizeFor(script, BODY_SIZE);
    const width = this.sansLabel(marker, BODY_SIZE, direction, 60, false).width;
    const baseline =
      top +
      size * (script === "arabic" ? BASELINE_RATIO.arabic : BASELINE_RATIO.latin);
    const x =
      direction === "rtl"
        ? bounds.left + bounds.width - width
        : bounds.left + indent - width - 6;
    this.drawSansLine(
      marker,
      BODY_SIZE,
      direction,
      x,
      baseline,
      COLOR.inkSoft,
      60,
      false,
    );
    this.doc.fillColor(COLOR.ink);
  }

  /* ------------------------------------------------------------------ table */

  private drawTable(
    node: TreeNode,
    direction: "rtl" | "ltr",
    bounds: { left: number; width: number },
  ): void {
    const rows = (node.content ?? []).filter((row) => row.type === "tableRow");
    if (rows.length === 0) return;

    const columnCount = Math.max(
      ...rows.map((row) =>
        (row.content ?? []).reduce(
          (sum, cell) => sum + Math.max(1, Number(cell.attrs?.colspan ?? 1)),
          0,
        ),
      ),
    );
    const widths = this.columnWidths(rows, columnCount, bounds.width);
    const padding = 5;

    this.y += 4;

    let headerCells: TreeNode[] | null = null;

    for (const row of rows) {
      const cells = row.content ?? [];
      const isHeader = cells.every((cell) => cell.type === "tableHeader");
      if (isHeader && !headerCells) headerCells = cells;

      this.drawTableRow(cells, widths, direction, bounds, padding, isHeader, () => {
        // Repeat the header at the top of a continuation page.
        if (headerCells && headerCells !== cells) {
          this.drawTableRow(
            headerCells,
            widths,
            direction,
            bounds,
            padding,
            true,
            undefined,
          );
        }
      });
    }

    this.y += BODY_SIZE * 0.62;
  }

  private columnWidths(
    rows: TreeNode[],
    columnCount: number,
    totalWidth: number,
  ): number[] {
    const declared = new Array<number | null>(columnCount).fill(null);
    for (const row of rows) {
      let column = 0;
      for (const cell of row.content ?? []) {
        const span = Math.max(1, Number(cell.attrs?.colspan ?? 1));
        const colwidth = cell.attrs?.colwidth;
        if (Array.isArray(colwidth) && span === 1 && typeof colwidth[0] === "number") {
          declared[column] = colwidth[0];
        }
        column += span;
      }
    }
    const known = declared.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    const unknownCount = declared.filter((value) => value === null).length;
    const scale = known > 0 && unknownCount === 0 ? totalWidth / known : 1;

    if (unknownCount === 0) return declared.map((value) => (value ?? 0) * scale);

    const remaining = Math.max(totalWidth - known, totalWidth * 0.2);
    const each = remaining / unknownCount;
    const raw = declared.map((value) => value ?? each);
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((value) => (value / sum) * totalWidth);
  }

  /**
   * Draws one row, splitting it across pages at line boundaries when it does not
   * fit — cells are never clipped and text never disappears.
   */
  private drawTableRow(
    cells: TreeNode[],
    widths: number[],
    direction: "rtl" | "ltr",
    bounds: { left: number; width: number },
    padding: number,
    isHeader: boolean,
    onContinuation?: () => void,
  ): void {
    const rtl = direction === "rtl";

    // Column offsets, mirrored for RTL documents.
    const offsets: number[] = [];
    let cursor = 0;
    for (const width of widths) {
      offsets.push(cursor);
      cursor += width;
    }

    interface CellLayout {
      lines: Line[];
      x: number;
      width: number;
      cell: TreeNode;
      consumed: number;
    }

    const layouts: CellLayout[] = [];
    let column = 0;
    for (const cell of cells) {
      const span = Math.max(1, Number(cell.attrs?.colspan ?? 1));
      const cellWidth = widths
        .slice(column, column + span)
        .reduce((a, b) => a + b, 0);
      const logicalX = offsets[column] ?? 0;
      const x = rtl
        ? bounds.left + bounds.width - logicalX - cellWidth
        : bounds.left + logicalX;

      const cellDirection = this.directionOf(cell, direction);
      const segments = (cell.content ?? [])
        .filter((child) => child.type === "paragraph" || child.type === "heading")
        .map((child) => inlineChunks(child).flat());

      const lines: Line[] = [];
      for (const chunk of segments) {
        lines.push(
          ...this.layout(
            chunk.map((segment) => ({
              ...segment,
              style: { ...segment.style, bold: segment.style.bold || isHeader },
            })),
            cellWidth - padding * 2,
            { fontSize: BODY_SIZE * 0.95, direction: cellDirection },
          ),
        );
      }

      layouts.push({ lines, x, width: cellWidth, cell, consumed: 0 });
      column += span;
    }

    const lineHeight = (line: Line) =>
      (line.hasArabic
        ? this.sizeFor("arabic", BODY_SIZE * 0.95) * LEADING.arabic
        : BODY_SIZE * 0.95 * LEADING.latin) * 0.94;

    let remainingLines = Math.max(...layouts.map((layout) => layout.lines.length), 1);
    let first = true;

    while (remainingLines > 0) {
      const available = this.bottomLimit - this.y - padding * 2;
      const minimumHeight = BODY_SIZE * 2.4;

      if (available < minimumHeight) {
        this.addPage();
        if (!first || onContinuation) onContinuation?.();
        continue;
      }

      // How many lines of the tallest cell fit in the space we have?
      let height = 0;
      let take = 0;
      const heights = layouts.map((layout) => {
        let cellHeight = 0;
        let count = 0;
        for (
          let index = layout.consumed;
          index < layout.lines.length;
          index += 1
        ) {
          const next = lineHeight(layout.lines[index]);
          if (cellHeight + next > available) break;
          cellHeight += next;
          count += 1;
        }
        return { cellHeight, count };
      });
      height = Math.max(...heights.map((entry) => entry.cellHeight), BODY_SIZE);
      take = Math.max(...heights.map((entry) => entry.count));

      if (take === 0) {
        // Not even one line fits — move to a fresh page and retry.
        this.addPage();
        onContinuation?.();
        continue;
      }

      const rowTop = this.y;
      const rowHeight = height + padding * 2;

      if (isHeader) {
        this.doc
          .save()
          .rect(bounds.left, rowTop, bounds.width, rowHeight)
          .fill(COLOR.surface)
          .restore();
      }

      // Cell text
      for (const layout of layouts) {
        const slice = layout.lines.slice(
          layout.consumed,
          layout.consumed + take,
        );
        let y = rowTop + padding;
        for (const line of slice) {
          const arabic = line.hasArabic;
          const size = arabic
            ? this.sizeFor("arabic", BODY_SIZE * 0.95)
            : BODY_SIZE * 0.95;
          const baseline =
            y + size * (arabic ? BASELINE_RATIO.arabic : BASELINE_RATIO.latin);
          const cellDirection = this.directionOf(layout.cell, direction);
          this.drawLine(
            line,
            { fontSize: BODY_SIZE * 0.95, direction: cellDirection },
            layout.x + padding,
            layout.width - padding * 2,
            baseline,
            true,
          );
          y += lineHeight(line);
        }
        layout.consumed += slice.length;
      }

      // Borders
      this.doc.save().lineWidth(0.6).strokeColor(COLOR.line);
      this.doc.rect(bounds.left, rowTop, bounds.width, rowHeight).stroke();
      for (const layout of layouts) {
        this.doc
          .moveTo(layout.x, rowTop)
          .lineTo(layout.x, rowTop + rowHeight)
          .stroke();
      }
      this.doc.restore();

      this.y = rowTop + rowHeight;
      remainingLines = Math.max(
        ...layouts.map((layout) => layout.lines.length - layout.consumed),
        0,
      );
      first = false;
      if (remainingLines > 0) {
        this.addPage();
        onContinuation?.();
      }
    }
  }

  /**
   * A single page carrying one word, separating the report from the evidence
   * that follows. The report itself ends before it, so nothing is appended to
   * the document proper — the divider reads as the start of the exhibits.
   */
  private drawAttachmentsDivider(): void {
    this.addPage();
    this.y = this.page.height / 2 - 30;
    this.drawParagraph(
      [{ text: this.t.pdf.attachmentsTitle, style: PLAIN_STYLE }],
      {
        fontSize: 20,
        bold: true,
        direction: this.input.direction,
        align: "center",
      },
    );
  }

  /* -------------------------------------------------------------- furniture */

  private drawPageFurniture(): void {
    const range = this.doc.bufferedPageRange();
    const total = range.count;

    for (let index = 0; index < total; index += 1) {
      this.doc.switchToPage(range.start + index);

      const footerY = this.page.height - MARGIN.bottom + 22;

      this.doc
        .save()
        .lineWidth(0.5)
        .strokeColor(COLOR.lineSoft)
        .moveTo(MARGIN.left, footerY - 10)
        .lineTo(this.page.width - MARGIN.right, footerY - 10)
        .stroke()
        .restore();

      // Page number, centred.
      const arabicNumbers = this.input.locale === "ar";
      const pageLabel = arabicNumbers
        ? `${this.t.pdf.page} ${toArabicDigits(index + 1)} ${this.t.pdf.of} ${toArabicDigits(total)}`
        : `${this.t.pdf.page} ${index + 1} ${this.t.pdf.of} ${total}`;
      const labelWidth = this.sansLabel(
        pageLabel,
        8,
        this.input.direction,
        this.contentWidth,
      ).width;
      this.drawSansLine(
        pageLabel,
        8,
        this.input.direction,
        MARGIN.left + (this.contentWidth - labelWidth) / 2,
        footerY,
        COLOR.inkFaint,
      );

      // Report title on the leading edge, plus any configured footer text.
      const leading = [this.input.title.trim(), this.input.footerText.trim()]
        .filter(Boolean)
        .join("  ·  ");
      if (leading) {
        const available = (this.contentWidth - labelWidth) / 2 - 12;
        const width = Math.min(
          this.sansLabel(leading, 8, this.input.direction, available).width,
          available,
        );
        this.drawSansLine(
          leading,
          8,
          this.input.direction,
          this.rtl ? this.page.width - MARGIN.right - width : MARGIN.left,
          footerY,
          COLOR.inkFaint,
          available,
        );
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Tree helpers                                                               */
/* -------------------------------------------------------------------------- */

function markStyle(
  marks: { type: string; attrs?: Record<string, unknown> }[] | undefined,
): InlineStyle {
  const style: InlineStyle = { ...PLAIN_STYLE };
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case "bold":
        style.bold = true;
        break;
      case "italic":
        style.italic = true;
        break;
      case "underline":
        style.underline = true;
        break;
      case "strike":
        style.strike = true;
        break;
      case "code":
        style.code = true;
        break;
      case "link": {
        const href = mark.attrs?.href;
        if (typeof href === "string") style.link = href;
        break;
      }
    }
  }
  return style;
}

/**
 * Inline content of a block, split into chunks at hard breaks. Each chunk is
 * laid out as its own line group without paragraph spacing between them.
 */
function inlineChunks(node: TreeNode): Segment[][] {
  const chunks: Segment[][] = [];
  let current: Segment[] = [];

  for (const child of node.content ?? []) {
    if (child.type === "hardBreak") {
      chunks.push(current);
      current = [];
      continue;
    }
    if (child.type === "text" && typeof child.text === "string" && child.text !== "") {
      current.push({ text: child.text, style: markStyle(child.marks) });
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks.filter((chunk, index) => chunk.length > 0 || index < chunks.length - 1);
}

function clampLevel(value: unknown): number {
  const level = Number(value ?? 1);
  if (!Number.isFinite(level)) return 1;
  return Math.min(4, Math.max(1, Math.round(level)));
}

function formatDate(date: Date, locale: "en" | "ar"): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function toArabicDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (digit) =>
    String.fromCharCode(0x0660 + Number(digit)),
  );
}

/* -------------------------------------------------------------------------- */

export async function renderReportPdf(
  input: RenderInput,
): Promise<RenderedReport> {
  return new ReportRenderer(input).build();
}
