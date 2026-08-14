import { ApiError, badRequest } from "@/lib/api";
import { env } from "@/lib/env";
import {
  deleteObjects,
  getObjectBuffer,
  headObjectSize,
  putObject,
} from "@/lib/storage/r2";
import { uploadKey } from "@/lib/storage/keys";
import { imageToPdf, inspectPdf } from "./image-to-pdf";
import {
  kindFromMimeType,
  pdfFileName,
  sniffKind,
  type UploadKind,
} from "./file-types";

export interface StoredEvidence {
  fileName: string;
  originalFileName: string;
  originalMimeType: string;
  convertedFromImage: boolean;
  storageKey: string;
  size: number;
  pageCount: number;
}

/**
 * Turns a freshly uploaded original into the report's evidence PDF.
 *
 * Every attachment ends up as a PDF: uploaded PDFs are kept byte-for-byte (never
 * rasterised), and images are converted to a one-page PDF and the original is
 * deleted. Validation happens on the stored bytes, not on what the client said.
 */
export async function storeEvidenceFromUpload(params: {
  reportId: string;
  originalKey: string;
  originalFileName: string;
  declaredMimeType: string;
}): Promise<StoredEvidence> {
  const { reportId, originalKey, originalFileName, declaredMimeType } = params;

  const uploadedSize = await headObjectSize(originalKey).catch(() => {
    throw badRequest("Upload not found. Please try again.");
  });
  if (uploadedSize === 0) throw badRequest("Uploaded file is empty.");
  if (uploadedSize > env.uploadMaxBytes) {
    await deleteObjects([originalKey]);
    throw badRequest(
      `File is larger than ${Math.round(env.uploadMaxBytes / (1024 * 1024))} MB.`,
    );
  }

  const bytes = await getObjectBuffer(originalKey);

  // The real type wins over the browser-declared one.
  const actualKind = sniffKind(bytes);
  const declaredKind = kindFromMimeType(declaredMimeType);
  if (!actualKind) {
    await deleteObjects([originalKey]);
    throw badRequest("Only PDF, JPG and PNG files are supported.");
  }
  if (declaredKind && declaredKind !== actualKind) {
    await deleteObjects([originalKey]);
    throw badRequest("File contents do not match its type.");
  }

  const fileName = pdfFileName(originalFileName);

  if (actualKind === "pdf") {
    const info = await inspectPdf(bytes).catch(() => null);
    if (!info) {
      await deleteObjects([originalKey]);
      throw badRequest("This PDF could not be read.");
    }
    if (info.encrypted) {
      await deleteObjects([originalKey]);
      throw badRequest(
        "Password-protected PDFs cannot be embedded. Please upload an unprotected copy.",
      );
    }
    return {
      fileName,
      originalFileName,
      originalMimeType: "application/pdf",
      convertedFromImage: false,
      storageKey: originalKey,
      size: bytes.byteLength,
      pageCount: info.pageCount,
    };
  }

  // Image → PDF. The converted PDF becomes the attachment; the original is dropped.
  const converted = await convertImage(bytes, actualKind, fileName, originalKey);
  const pdfKey = uploadKey(reportId, "pdf", "pdf");
  await putObject(pdfKey, converted.bytes, "application/pdf");
  await deleteObjects([originalKey]);

  return {
    fileName,
    originalFileName,
    originalMimeType: actualKind === "png" ? "image/png" : "image/jpeg",
    convertedFromImage: true,
    storageKey: pdfKey,
    size: converted.bytes.byteLength,
    pageCount: converted.pageCount,
  };
}

async function convertImage(
  bytes: Buffer,
  kind: Extract<UploadKind, "jpeg" | "png">,
  title: string,
  originalKey: string,
) {
  try {
    return await imageToPdf(bytes, kind, title);
  } catch (error) {
    await deleteObjects([originalKey]);
    console.error("Image to PDF conversion failed", error);
    throw new ApiError(
      422,
      "This image could not be converted to PDF. Progressive JPEGs and interlaced PNGs are not supported — please re-save and try again.",
    );
  }
}

/** Removes the stored PDF of an attachment from R2. */
export async function removeEvidenceFiles(
  storageKeys: string[],
): Promise<void> {
  await deleteObjects(storageKeys);
}
