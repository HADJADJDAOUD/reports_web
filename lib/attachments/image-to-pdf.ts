import { PDFDocument } from "pdf-lib";
import type { UploadKind } from "./file-types";

/** A4 at 72 dpi, used as the page box for converted images. */
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 28.35; // 10mm

export interface ConvertedPdf {
  bytes: Buffer;
  pageCount: number;
}

/**
 * Converts an uploaded JPEG/PNG into a single-page PDF, scaled to fit an A4 page
 * without upscaling and without re-encoding the image data. Implemented with
 * pdf-lib only — no native binaries — so it runs unchanged on Vercel.
 */
export async function imageToPdf(
  bytes: Buffer,
  kind: Extract<UploadKind, "jpeg" | "png">,
  title: string,
): Promise<ConvertedPdf> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("Lexis");
  pdf.setProducer("Lexis");

  const image =
    kind === "jpeg"
      ? await pdf.embedJpg(new Uint8Array(bytes))
      : await pdf.embedPng(new Uint8Array(bytes));

  const maxWidth = PAGE_WIDTH - MARGIN * 2;
  const maxHeight = PAGE_HEIGHT - MARGIN * 2;

  // Portrait or landscape page, whichever wastes less space.
  const landscape = image.width > image.height;
  const pageWidth = landscape ? PAGE_HEIGHT : PAGE_WIDTH;
  const pageHeight = landscape ? PAGE_WIDTH : PAGE_HEIGHT;
  const boxWidth = landscape ? maxHeight : maxWidth;
  const boxHeight = landscape ? maxWidth : maxHeight;

  const scale = Math.min(
    boxWidth / image.width,
    boxHeight / image.height,
    1, // never enlarge — keeps evidence at or below its native resolution
  );
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;

  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(image, {
    x: (pageWidth - drawWidth) / 2,
    y: (pageHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  });

  const output = await pdf.save({ useObjectStreams: false });
  return { bytes: Buffer.from(output), pageCount: 1 };
}

export interface PdfInfo {
  pageCount: number;
  encrypted: boolean;
}

/**
 * Validates that an uploaded PDF can actually be parsed, and reports its page
 * count. Encrypted PDFs are rejected because they cannot be embedded reliably.
 */
export async function inspectPdf(bytes: Buffer): Promise<PdfInfo> {
  const pdf = await PDFDocument.load(new Uint8Array(bytes), {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  return { pageCount: pdf.getPageCount(), encrypted: pdf.isEncrypted };
}
