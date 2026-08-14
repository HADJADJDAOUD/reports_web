import { readFileSync } from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";

/**
 * Fonts embedded into every exported PDF.
 *
 * Both families are bundled with the application and subset into the output
 * file, so Arabic and Latin text render identically on a machine that has
 * neither installed — which is the whole point of an offline evidence file.
 *
 *   Amiri     — Arabic (Naskh) + Latin, SIL OFL
 *   PT Serif  — Latin document text, SIL OFL
 *   IBM Plex Sans Arabic — UI-scale text (chips, headers, footers), SIL OFL
 */

export type FontWeight = "regular" | "bold";
export type FontStyle = "normal" | "italic";
export type Script = "arabic" | "latin";

export interface FontKey {
  script: Script;
  weight: FontWeight;
  style: FontStyle;
  /** Sans family used for chips and page furniture. */
  sans?: boolean;
}

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

const FILES = {
  "amiri-regular": "Amiri-Regular.ttf",
  "amiri-bold": "Amiri-Bold.ttf",
  "amiri-italic": "Amiri-Italic.ttf",
  "amiri-bolditalic": "Amiri-BoldItalic.ttf",
  "serif-regular": "PTSerif-Regular.ttf",
  "serif-bold": "PTSerif-Bold.ttf",
  "serif-italic": "PTSerif-Italic.ttf",
  "serif-bolditalic": "PTSerif-BoldItalic.ttf",
  "sans-regular": "IBMPlexSansArabic-Regular.ttf",
  "sans-bold": "IBMPlexSansArabic-SemiBold.ttf",
} as const;

export type FontName = keyof typeof FILES;

const cache = new Map<FontName, Buffer>();

export function fontBuffer(name: FontName): Buffer {
  const cached = cache.get(name);
  if (cached) return cached;
  const buffer = readFileSync(path.join(FONT_DIR, FILES[name]));
  cache.set(name, buffer);
  return buffer;
}

export const ALL_FONT_NAMES = Object.keys(FILES) as FontName[];

/** Picks the font for a run of text of a given script and emphasis. */
export function resolveFontName(key: FontKey): FontName {
  if (key.sans) {
    return key.weight === "bold" ? "sans-bold" : "sans-regular";
  }
  const suffix =
    key.weight === "bold" && key.style === "italic"
      ? "bolditalic"
      : key.weight === "bold"
        ? "bold"
        : key.style === "italic"
          ? "italic"
          : "regular";
  return (key.script === "arabic" ? `amiri-${suffix}` : `serif-${suffix}`) as FontName;
}

export interface Metrics {
  /** Ascender, descender and x-height as fractions of the em. */
  ascent: number;
  descent: number;
  xHeight: number;
  capHeight: number;
}

const metricsCache = new Map<FontName, Metrics>();

/** Vertical metrics, normalised to the em, used for baselines and underlines. */
export function fontMetrics(name: FontName): Metrics {
  const cached = metricsCache.get(name);
  if (cached) return cached;
  const font = fontkit.create(fontBuffer(name));
  const em = font.unitsPerEm || 1000;
  const metrics: Metrics = {
    ascent: font.ascent / em,
    descent: font.descent / em,
    xHeight: font.xHeight / em,
    capHeight: font.capHeight / em,
  };
  metricsCache.set(name, metrics);
  return metrics;
}

/**
 * Amiri sits on a smaller optical size than PT Serif at the same point size, so
 * Arabic runs are nudged up to keep a mixed line visually even.
 */
export const ARABIC_SIZE_SCALE = 1.13;
