import type { Locale } from "@/lib/i18n/dictionaries";

/**
 * Naming rules for an exported report and the evidence beside it.
 *
 * The export lands as:
 *
 *     تقرير.pdf
 *     attachments-6a7ef14d/01-receipt.pdf, 02.pdf, …
 *
 * and each chip in the report is a **relative link** into that folder. These
 * names are therefore load-bearing: what gets written to disk has to match what
 * the link asks for exactly, which is why every side of the export computes them
 * from here instead of inventing its own.
 *
 * Everything a link touches is plain ASCII with no spaces. A link crosses a PDF
 * viewer's URI parser, the filesystem and, on Windows, a code page; percent-encoded
 * Arabic does not survive that reliably. Readable names still appear on the chip
 * and throughout the app.
 */

/** ASCII slug of a title, empty when it has no Latin characters. */
function slugify(value: string, maxLength: number): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .toLowerCase();
}

/**
 * The folder that holds the evidence, named after the report so two exports
 * never merge into one another in a downloads folder. Falls back to a slice of
 * the report id when the title has nothing ASCII in it.
 */
export function attachmentsDirName(title: string, reportId: string): string {
  const slug = slugify(title, 40);
  return `attachments-${slug || reportId.slice(-8)}`;
}

/**
 * The name an attachment gets inside that folder. The number prefix follows the
 * order the files are cited and guarantees uniqueness.
 */
export function bundleFileName(index: number, fileName: string): string {
  const slug = slugify(fileName.replace(/\.pdf$/i, ""), 40);
  const number = String(index + 1).padStart(2, "0");
  return slug ? `${number}-${slug}.pdf` : `${number}.pdf`;
}

/**
 * How the export is laid out on disk. This has to be decided *before* the PDF is
 * rendered, because it changes what the chips link to.
 *
 *  - `folder` — report plus an attachments folder. Only possible where the
 *    browser can write a directory (File System Access API).
 *  - `flat` — report and files side by side, for browsers that can only download.
 */
export type ExportLayout = "folder" | "flat";

/** The path a chip links to, relative to the report. */
export function attachmentHref(
  layout: ExportLayout,
  dirName: string,
  index: number,
  fileName: string,
): string {
  const name = bundleFileName(index, fileName);
  return layout === "folder" ? `${dirName}/${name}` : name;
}

/** The report's own file name, derived from its title. */
export function reportFileName(title: string, locale: Locale): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${cleaned || (locale === "ar" ? "تقرير" : "report")}.pdf`;
}
