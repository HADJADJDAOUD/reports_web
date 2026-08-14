import type { AttachmentDoc, ReportDoc } from "@/lib/db/models";
import { getDictionary, type Locale } from "@/lib/i18n/dictionaries";
import { env } from "@/lib/env";
import { getObjectBuffer } from "@/lib/storage/r2";
import { renderReportPdf, type RenderAttachment } from "./renderer";
import {
  attachmentHref,
  attachmentsDirName,
  bundleFileName,
  reportFileName,
  type ExportLayout,
} from "./bundle";

export interface ExportedReport {
  bytes: Buffer;
  fileName: string;
}

/**
 * Renders the report PDF.
 *
 * The evidence is never packed into this file. It is written next to it — inside
 * an attachments folder where the browser can create one, otherwise alongside it
 * — and each chip is a relative link to it. So the reader opens the report, clicks
 * a reference, and the document opens: no attachments pane, no special reader, no
 * archive to unpack, no network.
 *
 * `layout` therefore has to be settled before rendering, because it decides what
 * the links say. PROJECT.md §5a records the five delivery formats that were tried
 * and why this is the one that survived.
 */
export async function exportReportPdf(params: {
  report: ReportDoc;
  attachments: AttachmentDoc[];
  locale: Locale;
  authorName: string;
  layout: ExportLayout;
}): Promise<ExportedReport> {
  const { report, attachments, locale, authorName, layout } = params;

  const loaded = await Promise.all(
    attachments.map(async (attachment) => ({
      attachment,
      bytes: await getObjectBuffer(attachment.storageKey),
    })),
  );

  const dirName = attachmentsDirName(report.title, report._id!.toHexString());
  const usedNames = new Set<string>();

  const renderAttachments: RenderAttachment[] = loaded.map(
    ({ attachment, bytes }, index) => {
      const fileName = uniqueName(attachment.fileName, usedNames);
      return {
        id: attachment._id!.toHexString(),
        fileName,
        href: attachmentHref(layout, dirName, index, fileName),
        bundleName: bundleFileName(index, fileName),
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
