import { z } from "zod";

/**
 * The report body is stored as a validated ProseMirror document tree — never as
 * an opaque HTML string. Only the node and mark types below are accepted, and
 * every attribute is whitelisted, which is what keeps stored content safe to
 * render again later.
 *
 * Block-level nodes carry a `blockId`: a stable identifier that survives text
 * edits and is the anchor attachments are linked to.
 */

export const BLOCK_NODE_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
  "tableCell",
  "tableHeader",
] as const;

export type BlockNodeType = (typeof BLOCK_NODE_TYPES)[number];

/** Block types a user may attach evidence to. */
export const ATTACHABLE_NODE_TYPES: readonly string[] = [
  "paragraph",
  "heading",
  "blockquote",
  "listItem",
];

const alignment = z.enum(["left", "center", "right", "justify"]);
const direction = z.enum(["rtl", "ltr"]);

const blockIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{6,24}$/, "invalid blockId");

const linkMark = z.object({
  type: z.literal("link"),
  attrs: z
    .object({
      href: z
        .string()
        .max(2048)
        .refine(
          (value) => /^(https?:\/\/|mailto:|tel:)/i.test(value),
          "only http(s), mailto and tel links are allowed",
        ),
      target: z.string().max(32).nullish(),
      rel: z.string().max(128).nullish(),
      class: z.string().max(128).nullish(),
    })
    .strip(),
});

const simpleMark = z.object({
  type: z.enum(["bold", "italic", "underline", "strike", "code"]),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

const markSchema = z.union([linkMark, simpleMark]);

const textNode = z.object({
  type: z.literal("text"),
  text: z.string().max(20_000),
  marks: z.array(markSchema).max(8).optional(),
});

const hardBreakNode = z.object({
  type: z.literal("hardBreak"),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

const inlineNode = z.union([textNode, hardBreakNode]);

type InlineNode = z.infer<typeof inlineNode>;

const blockAttrs = z
  .object({
    // A block can legitimately arrive without an id — the editor assigns one as
    // soon as it loads the document — so null is accepted and simply means
    // "nothing is attached here".
    blockId: blockIdSchema.nullish(),
    textAlign: alignment.nullish(),
    dir: direction.nullish(),
  })
  .strip();

/** Nodes that can appear directly inside the document or a list item / cell. */
export interface ParagraphNode {
  type: "paragraph";
  attrs?: z.infer<typeof blockAttrs>;
  content?: InlineNode[];
}

export interface HeadingNode {
  type: "heading";
  attrs?: z.infer<typeof blockAttrs> & { level?: number };
  content?: InlineNode[];
}

const paragraphNode: z.ZodType<ParagraphNode> = z.object({
  type: z.literal("paragraph"),
  attrs: blockAttrs.optional(),
  content: z.array(inlineNode).max(4000).optional(),
});

const headingNode: z.ZodType<HeadingNode> = z.object({
  type: z.literal("heading"),
  attrs: blockAttrs.extend({ level: z.number().int().min(1).max(4) }).optional(),
  content: z.array(inlineNode).max(4000).optional(),
});

// Lists, blockquotes and tables nest, so the schema is defined lazily.
export type FlowNode =
  | ParagraphNode
  | HeadingNode
  | { type: "horizontalRule"; attrs?: unknown }
  | { type: "bulletList"; attrs?: unknown; content?: ListItemNode[] }
  | {
      type: "orderedList";
      attrs?: { start?: number } & z.infer<typeof blockAttrs>;
      content?: ListItemNode[];
    }
  | { type: "blockquote"; attrs?: unknown; content?: FlowNode[] }
  | { type: "table"; attrs?: unknown; content?: TableRowNode[] };

export interface ListItemNode {
  type: "listItem";
  attrs?: z.infer<typeof blockAttrs>;
  content?: FlowNode[];
}

export interface TableCellNode {
  type: "tableCell" | "tableHeader";
  attrs?: {
    blockId?: string;
    colspan?: number;
    rowspan?: number;
    colwidth?: number[] | null;
  };
  content?: FlowNode[];
}

export interface TableRowNode {
  type: "tableRow";
  attrs?: unknown;
  content?: TableCellNode[];
}

const flowNode: z.ZodType<FlowNode> = z.lazy(() =>
  z.union([
    paragraphNode,
    headingNode,
    z.object({
      type: z.literal("horizontalRule"),
      attrs: z.record(z.string(), z.unknown()).optional(),
    }),
    z.object({
      type: z.literal("bulletList"),
      attrs: z.record(z.string(), z.unknown()).optional(),
      content: z.array(listItemNode).max(500).optional(),
    }),
    z.object({
      type: z.literal("orderedList"),
      attrs: blockAttrs
        .extend({ start: z.number().int().min(0).max(9999).optional() })
        .optional(),
      content: z.array(listItemNode).max(500).optional(),
    }),
    z.object({
      type: z.literal("blockquote"),
      attrs: blockAttrs.optional(),
      content: z.array(flowNode).max(200).optional(),
    }),
    z.object({
      type: z.literal("table"),
      attrs: z.record(z.string(), z.unknown()).optional(),
      content: z.array(tableRowNode).max(300).optional(),
    }),
  ]),
) as z.ZodType<FlowNode>;

const listItemNode: z.ZodType<ListItemNode> = z.lazy(() =>
  z.object({
    type: z.literal("listItem"),
    attrs: blockAttrs.optional(),
    content: z.array(flowNode).max(100).optional(),
  }),
) as z.ZodType<ListItemNode>;

const tableCellNode: z.ZodType<TableCellNode> = z.lazy(() =>
  z.object({
    type: z.enum(["tableCell", "tableHeader"]),
    attrs: z
      .object({
        blockId: blockIdSchema.nullish(),
        colspan: z.number().int().min(1).max(30).nullish(),
        rowspan: z.number().int().min(1).max(30).nullish(),
        colwidth: z.array(z.number()).nullish(),
      })
      .strip()
      .optional(),
    content: z.array(flowNode).max(50).optional(),
  }),
) as z.ZodType<TableCellNode>;

const tableRowNode: z.ZodType<TableRowNode> = z.lazy(() =>
  z.object({
    type: z.literal("tableRow"),
    attrs: z.record(z.string(), z.unknown()).optional(),
    content: z.array(tableCellNode).max(30).optional(),
  }),
) as z.ZodType<TableRowNode>;

export const docSchema = z.object({
  type: z.literal("doc"),
  content: z.array(flowNode).max(3000).optional(),
});

export type DocNode = z.infer<typeof docSchema>;

export const EMPTY_DOC: DocNode = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/** Collects every blockId present in a document, in reading order. */
export function collectBlockIds(doc: DocNode): string[] {
  const ids: string[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    const candidate = node as {
      attrs?: { blockId?: unknown };
      content?: unknown[];
    };
    const blockId = candidate.attrs?.blockId;
    if (typeof blockId === "string") ids.push(blockId);
    if (Array.isArray(candidate.content)) candidate.content.forEach(walk);
  };
  walk(doc);
  return ids;
}

/** Plain-text preview of a document, used for report list cards. */
export function docExcerpt(doc: DocNode, maxLength = 180): string {
  const parts: string[] = [];
  const walk = (node: unknown): void => {
    if (parts.join(" ").length > maxLength * 2) return;
    if (!node || typeof node !== "object") return;
    const candidate = node as {
      type?: string;
      text?: string;
      content?: unknown[];
    };
    if (candidate.type === "text" && typeof candidate.text === "string") {
      parts.push(candidate.text);
    }
    if (Array.isArray(candidate.content)) candidate.content.forEach(walk);
  };
  walk(doc);
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
