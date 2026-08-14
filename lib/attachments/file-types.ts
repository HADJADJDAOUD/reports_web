/**
 * Upload validation. The declared MIME type from the browser is treated as a
 * hint only — the stored bytes are always checked against magic numbers before
 * anything is converted or embedded.
 */

export type UploadKind = "pdf" | "jpeg" | "png";

export const ACCEPTED_MIME_TYPES: Record<string, UploadKind> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/pjpeg": "jpeg",
  "image/png": "png",
};

export const ACCEPT_ATTRIBUTE =
  ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export function kindFromMimeType(mimeType: string): UploadKind | null {
  return ACCEPTED_MIME_TYPES[mimeType.toLowerCase().trim()] ?? null;
}

export function extensionForKind(kind: UploadKind): string {
  return kind === "pdf" ? "pdf" : kind === "png" ? "png" : "jpg";
}

/** Detects the real type from the leading bytes. Returns null if unsupported. */
export function sniffKind(bytes: Buffer): UploadKind | null {
  if (bytes.length < 8) return null;
  // "%PDF-"
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return "pdf";
  }
  // JPEG start-of-image marker
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  // PNG signature
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  return null;
}

/** Control characters, which must never reach a PDF name or a filesystem. */
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");
const PATH_UNSAFE = /[<>:"|?*/\\]/g;

/**
 * Makes a user-supplied file name safe to display, to store as PDF metadata and
 * to use as a PDF embedded-file name. Unicode (including Arabic) is preserved.
 */
export function sanitizeFileName(name: string, fallback = "evidence"): string {
  const base = name
    .replace(/\\/g, "/")
    .split("/")
    .pop()!
    .replace(CONTROL_CHARS, "")
    .replace(PATH_UNSAFE, "")
    .trim();
  const withoutExtension = base.replace(/\.[A-Za-z0-9]{1,8}$/, "").trim();
  return (withoutExtension || fallback).slice(0, 120);
}

/** `receipt.jpg` → `receipt.pdf` */
export function pdfFileName(originalName: string): string {
  return `${sanitizeFileName(originalName)}.pdf`;
}

/**
 * Compact label for an inline file reference.
 *
 * Chips sit inside a sentence, so the name is clipped to `maxLength` characters
 * *including* the extension — `after_teeth_1.pdf` becomes `after….pdf`. The full
 * name stays available on hover, in the evidence list, and in the exported PDF's
 * attachments index.
 */
export function shortFileName(fileName: string, maxLength = 10): string {
  if (fileName.length <= maxLength) return fileName;

  const dot = fileName.lastIndexOf(".");
  const extension = dot > 0 ? fileName.slice(dot) : "";
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;

  // No room for even one character of the name: clip the whole thing instead.
  const room = maxLength - extension.length - 1;
  if (room < 1) return `${fileName.slice(0, Math.max(1, maxLength - 1))}…`;

  // Trailing separators immediately before the ellipsis just look like noise.
  const kept = base.slice(0, room).replace(/[\s._-]+$/, "") || base.slice(0, 1);
  return `${kept}…${extension}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}
