/**
 * Checks the PDF renderer's bidi pipeline against bidi-js's own reference
 * implementation of the Unicode Bidirectional Algorithm.
 *
 * The renderer lays text out as *atoms* (see lib/pdf/bidi-text.ts) rather than
 * characters, so this reconstructs the visual string from those atoms and
 * compares it with `getReorderedString`, which is known-good. Any mismatch means
 * Arabic or mixed-direction text would come out in the wrong order in an export.
 *
 * Run with: npm run verify:bidi
 */
import bidiFactory from "bidi-js";
import { buildAtoms, reorderAtoms } from "../lib/pdf/bidi-text";

const bidi = bidiFactory();

/** Visual string implied by the renderer's atom ordering. */
function visualFromAtoms(text: string, direction: "rtl" | "ltr"): string {
  const atoms = buildAtoms([{ text, style: plain() }], direction).map((atom) => ({
    ...atom,
    width: 0,
  }));
  return reorderAtoms(atoms)
    .map((atom) =>
      atom.level % 2 === 1 ? [...atom.text].reverse().join("") : atom.text,
    )
    .join("");
}

function plain() {
  return {
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    code: false,
  };
}

const cases: { text: string; direction: "rtl" | "ltr"; label: string }[] = [
  {
    label: "Arabic with amount, parentheses and ISO date",
    text: "تم الاتفاق على إصلاح العطل، وقمت بسداد مبلغ (2200 ريال) بموجب حوالة بنكية بتاريخ 2026-02-11م.",
    direction: "rtl",
  },
  {
    label: "English with an embedded Arabic phrase",
    text: "Total paid was 2200 SAR (حوالة بنكية) on 2026-02-11.",
    direction: "ltr",
  },
  {
    label: "Arabic-Indic digits in an Arabic sentence",
    text: "صفحة ٢ من ١٤ — التقرير رقم ٢٠٢٦",
    direction: "rtl",
  },
  {
    label: "Latin word inside Arabic",
    text: "تقرير Report رقم 12 — نهائي",
    direction: "rtl",
  },
  {
    label: "Arabic inside Latin with brackets",
    text: "Mixed line: التقرير النهائي رقم 12 (2026) — final.",
    direction: "ltr",
  },
  {
    label: "Nested brackets and punctuation",
    text: "المرفق [حوالة (2200) ريال]: تم السداد.",
    direction: "rtl",
  },
  { label: "Pure Latin", text: "The quick brown fox — 2026.", direction: "ltr" },
  { label: "Pure Arabic", text: "المستندات المؤيدة مرفقة بهذا التقرير.", direction: "rtl" },
  {
    label: "File name with extension in RTL",
    text: "حوالة اصلاح للورشة.pdf",
    direction: "rtl",
  },
  {
    label: "Percentages and slashes",
    text: "نسبة التلف 15% بتاريخ 08/04/2026 حسب التقرير.",
    direction: "rtl",
  },
  {
    label: "Phone and email in Arabic text",
    text: "للتواصل: +966 55 123 4567 أو report@example.com للاستفسار.",
    direction: "rtl",
  },
  {
    label: "RTL paragraph ending in Latin",
    text: "المرفق التالي هو invoice-apex.pdf",
    direction: "rtl",
  },
];

let failures = 0;

for (const { text, direction, label } of cases) {
  const embedding = bidi.getEmbeddingLevels(text, direction);
  const expected = bidi.getReorderedString(text, embedding);
  const actual = visualFromAtoms(text, direction);

  if (actual === expected) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
    console.error(`       expected: ${JSON.stringify(expected)}`);
    console.error(`       actual:   ${JSON.stringify(actual)}`);
  }
}

console.log(
  `\n${cases.length - failures}/${cases.length} bidi cases match the reference implementation.`,
);
process.exit(failures === 0 ? 0 : 1);
