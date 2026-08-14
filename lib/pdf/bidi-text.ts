import bidiFactory from "bidi-js";
import type { Script } from "./fonts";

/**
 * Bidirectional text preparation for the PDF renderer.
 *
 * PDF content streams have no concept of writing direction: glyphs are placed at
 * explicit positions. Correct Arabic output therefore needs three things, and
 * this module produces all of them:
 *
 *  1. **Shaping** — handled downstream by fontkit inside PDFKit, which applies
 *     the font's OpenType tables so Arabic letters join and ligate. Shaping never
 *     crosses a space, so splitting text at spaces is safe.
 *  2. **Bidi reordering** — resolved here with bidi-js (the Unicode Bidirectional
 *     Algorithm), so `(2200 ريال)` and `2026-02-11` come out in the right visual
 *     order inside an RTL paragraph instead of reversed.
 *  3. **Mirroring** — brackets and similar characters are swapped for their
 *     mirrored counterparts when they sit in a right-to-left run.
 *
 * The unit of layout is an *atom*: a maximal stretch of characters that shares a
 * bidi level, a script, and an inline style, and that contains either only
 * whitespace or no whitespace at all. Atoms are what get measured, ordered and
 * drawn, which is also what keeps a line break from ever splitting a word or an
 * attachment chip.
 */

const bidi = bidiFactory();

export interface InlineStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  link?: string;
}

export const PLAIN_STYLE: InlineStyle = {
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
};

export interface Segment {
  text: string;
  style: InlineStyle;
}

export interface TextAtom {
  kind: "text";
  /** Logical-order text, ready to be shaped by the font. */
  text: string;
  level: number;
  script: Script;
  style: InlineStyle;
  isSpace: boolean;
  /** True when the characters must be reversed manually before drawing. */
  reverse: boolean;
  width: number;
}

export interface ChipAtom {
  kind: "chip";
  attachmentId: string;
  label: string;
  level: number;
  isSpace: false;
  width: number;
}

export type Atom = TextAtom | ChipAtom;

const ARABIC_RANGES: [number, number][] = [
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x0870, 0x089f], // Arabic Extended-B
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
];

export function isArabicCodePoint(codePoint: number): boolean {
  return ARABIC_RANGES.some(([from, to]) => codePoint >= from && codePoint <= to);
}

export function containsArabic(text: string): boolean {
  for (const character of text) {
    if (isArabicCodePoint(character.codePointAt(0)!)) return true;
  }
  return false;
}

const LATIN_LETTER = /[A-Za-zÀ-ɏḀ-ỿ]/;

/**
 * Which font family a stretch of characters should use.
 *
 * Letters pick their own script. Digits and punctuation are neutral, so they
 * follow the paragraph direction — that keeps numerals and full stops inside an
 * Arabic sentence in the same family (and therefore the same optical size) as
 * the words around them.
 */
function scriptFor(text: string, baseRtl: boolean): Script {
  if (containsArabic(text)) return "arabic";
  if (LATIN_LETTER.test(text)) return "latin";
  return baseRtl ? "arabic" : "latin";
}

/**
 * Whether a run has to be reversed before it is handed to the font.
 *
 * fontkit reverses any run it recognises as right-to-left. That is what we want
 * for Arabic words at an odd bidi level, but it is wrong twice over:
 *
 *  - punctuation-only runs at an odd level are not recognised as Arabic, so
 *    fontkit leaves them alone and we must reverse them ourselves;
 *  - Arabic-Indic digits (٠١٢٣…) *are* recognised as Arabic script, yet the bidi
 *    algorithm gives them an even level because numbers always read
 *    left-to-right. Those must be pre-reversed so fontkit's reversal cancels out.
 *
 * Reversal is therefore needed exactly when the two disagree.
 */
function needsManualReverse(text: string, level: number): boolean {
  const fontWillReverse = containsArabic(text);
  const shouldBeReversed = level % 2 === 1;
  return shouldBeReversed !== fontWillReverse;
}

function isWhitespace(character: string): boolean {
  return character === " " || character === "\t" || character === " ";
}

/**
 * Turns styled segments into atoms carrying bidi levels, in logical order.
 */
export function buildAtoms(
  segments: Segment[],
  baseDirection: "rtl" | "ltr",
): Omit<TextAtom, "width">[] {
  const text = segments.map((segment) => segment.text).join("");
  if (text.length === 0) return [];

  // Style index per character, so atoms never straddle a formatting change.
  const styleOf: number[] = [];
  segments.forEach((segment, index) => {
    for (let i = 0; i < segment.text.length; i += 1) styleOf.push(index);
  });

  const embedding = bidi.getEmbeddingLevels(text, baseDirection);
  const levels = embedding.levels;
  // Note: this one takes the raw levels array, unlike the reorder helpers.
  const mirrored = bidi.getMirroredCharactersMap(text, levels);
  const baseRtl = baseDirection === "rtl";

  const atoms: Omit<TextAtom, "width">[] = [];
  let start = 0;

  const flush = (end: number) => {
    if (end <= start) return;
    let display = "";
    for (let i = start; i < end; i += 1) {
      display += mirrored.get(i) ?? text[i];
    }
    const level = levels[start];
    const style = segments[styleOf[start]].style;
    const space = isWhitespace(text[start]);
    const script = space ? (baseRtl ? "arabic" : "latin") : scriptFor(display, baseRtl);
    atoms.push({
      kind: "text",
      text: display,
      level,
      script,
      style,
      isSpace: space,
      reverse: needsManualReverse(display, level),
    });
    start = end;
  };

  for (let index = 1; index <= text.length; index += 1) {
    if (index === text.length) {
      flush(index);
      break;
    }
    const changed =
      levels[index] !== levels[start] ||
      styleOf[index] !== styleOf[start] ||
      isWhitespace(text[index]) !== isWhitespace(text[start]) ||
      // Split at script boundaries so each atom is drawn with one font.
      scriptFor(text[index], baseRtl) !== scriptFor(text[start], baseRtl);
    if (changed) flush(index);
  }

  return atoms;
}

/**
 * Unicode Bidi Algorithm rule L2: reverse any contiguous sequence of atoms at
 * or above each level, from the highest level down to the lowest odd level.
 * Because every atom has a single level, applying L2 to atoms is equivalent to
 * applying it to characters.
 */
export function reorderAtoms<T extends { level: number }>(atoms: T[]): T[] {
  if (atoms.length < 2) return atoms.slice();

  const result = atoms.slice();
  let maxLevel = 0;
  let minOddLevel = Number.MAX_SAFE_INTEGER;
  for (const atom of atoms) {
    maxLevel = Math.max(maxLevel, atom.level);
    if (atom.level % 2 === 1) minOddLevel = Math.min(minOddLevel, atom.level);
  }
  if (minOddLevel === Number.MAX_SAFE_INTEGER) return result;

  for (let level = maxLevel; level >= minOddLevel; level -= 1) {
    let index = 0;
    while (index < result.length) {
      if (result[index].level < level) {
        index += 1;
        continue;
      }
      let end = index;
      while (end + 1 < result.length && result[end + 1].level >= level) end += 1;
      // Reverse in place [index, end]
      for (let left = index, right = end; left < right; left += 1, right -= 1) {
        const swap = result[left];
        result[left] = result[right];
        result[right] = swap;
      }
      index = end + 1;
    }
  }

  return result;
}

/** Text as it should be handed to the font: reversed only when required. */
export function drawableText(atom: TextAtom): string {
  return atom.reverse ? [...atom.text].reverse().join("") : atom.text;
}

/** Paragraph base level, used to place chips and align lines. */
export function baseLevel(direction: "rtl" | "ltr"): number {
  return direction === "rtl" ? 1 : 0;
}
