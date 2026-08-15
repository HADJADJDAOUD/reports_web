import type { AttachmentDoc, ReportDoc } from "@/lib/db/models";
import { getDictionary, type Locale } from "@/lib/i18n/dictionaries";
import { env } from "@/lib/env";
import { getObjectBuffer } from "@/lib/storage/r2";
import { renderReportPdf, type RenderAttachment } from "./renderer";
import { reportFileName } from "./bundle";

export interface ExportedReport {
  bytes: Buffer;
  fileName: string;
}

/**
 * Renders the report PDF.
 *
 * The evidence is embedded directly into the PDF for offline access. Each chip
 * links to its corresponding embedded file, so the reader can open the report,
 * click a reference, and the document opens without any external dependencies.
 */
export async function exportReportPdf(params: {
  report: ReportDoc;
  attachments: AttachmentDoc[];
  locale: Locale;
  authorName: string;
  layout: "folder" | "flat"; // Kept for API compatibility but not used
}): Promise<ExportedReport> {
  const { report, attachments, locale, authorName } = params;

  const loaded = await Promise.all(
    attachments.map(async (attachment) => ({
      attachment,
      bytes: await getObjectBuffer(attachment.storageKey),
    })),
  );

  const usedNames = new Set<string>();

  const renderAttachments: RenderAttachment[] = loaded.map(
    ({ attachment, bytes }) => {
      const fileName = uniqueName(attachment.fileName, usedNames);
      return {
        id: attachment._id!.toHexString(),
        fileName,
        description: attachment.description,
        size: bytes.byteLength,
        pageCount: attachment.pageCount,
        bytes,
        blockIds: attachment.blockIds,
        convertedFromImage: attachment.convertedFromImage,
        originalFileName: attachment.originalFileName,
      };
    },
  );

  const bytes = await renderReportPdf({
    title: report.title,
    subtitle: report.subtitle,
    direction: report.direction,
    content: report.content,
    attachments: renderAttachments,
    dictionary: getDictionary(locale),
    locale,
    authorName,
    generatedAt: new Date(),
    footerText: env.pdfFooterText,
    pageSize: env.pdfPageSize,
  });

  return { bytes, fileName: reportFileName(report.title, locale) };
}

/**
 * Display names are de-duplicated so no two chips read identically. The names on
 * disk cannot collide regardless — they carry a number prefix.
 */
function uniqueName(fileName: string, used: Set<string>): string {
  if (!used.has(fileName)) {
    used.add(fileName);
    return fileName;
  }
  const base = fileName.replace(/\.pdf$/i, "");
  for (let counter = 2; counter < 1000; counter += 1) {
    const candidate = `${base} (${counter}).pdf`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const fallback = `${base}-${Date.now()}.pdf`;
  used.add(fallback);
  return fallback;
}
