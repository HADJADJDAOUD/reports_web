import type { AttachmentDoc, ReportDoc } from "@/lib/db/models";
import { getDictionary, type Locale } from "@/lib/i18n/dictionaries";
import { env } from "@/lib/env";
import { renderReportPdf, type RenderAttachment } from "./renderer";
import { reportFileName } from "./bundle";
import { attachmentToken } from "@/lib/attachments/share-token";
import { getObjectBuffer } from "@/lib/storage/r2";
import { appendAnnexPages } from "./annex";

/**
 * How the evidence reaches the reader.
 *
 * - `link` (computers): the report stays text-only and each chip links to the
 *   attachment's viewer in the app; the files download alongside it.
 * - `annex` (phones): each attachment's pages are folded into the report and the
 *   chip jumps to them, because a mobile PDF viewer cannot reach a sibling file,
 *   an embedded attachment, or the network when offline.
 */
export type ExportMode = "link" | "annex";

export interface ExportedReport {
  bytes: Buffer;
  fileName: string;
}

/**
 * Where an attachment is viewed, given the deployment's own origin.
 *
 * The signed token is what makes the link work for whoever receives the report:
 * they have no account here, so an owner-authenticated URL would show them a
 * login page instead of the evidence.
 */
export function attachmentViewerUrl(baseUrl: string, id: string): string {
  const origin = baseUrl.replace(/\/+$/, "");
  return `${origin}/attachments/${id}?t=${attachmentToken(id)}`;
}

/**
 * Renders the report PDF.
 *
 * Each chip becomes a link to that attachment's viewer in the application, which
 * is the only target that works on a phone — see `RenderAttachment.href`.
 *
 * The attachment bytes are deliberately *not* read here: the report carries no
 * copy of the evidence, so exporting is a single Mongo read plus the render. The
 * files themselves are downloaded and emailed alongside the report, which is what
 * gives the reader offline copies.
 */
export async function exportReportPdf(params: {
  report: ReportDoc;
  attachments: AttachmentDoc[];
  locale: Locale;
  authorName: string;
  /** Absolute origin of this deployment, e.g. `https://app.vercel.app`. */
  baseUrl: string;
  mode: ExportMode;
}): Promise<ExportedReport> {
  const { report, attachments, locale, authorName, baseUrl, mode } = params;
  const annex = mode === "annex";

  const usedNames = new Set<string>();
  const renderAttachments: RenderAttachment[] = attachments.map(
    (attachment) => {
      const id = attachment._id!.toHexString();
      return {
        id,
        fileName: uniqueName(attachment.fileName, usedNames),
        href: attachmentViewerUrl(baseUrl, id),
        description: attachment.description,
        size: attachment.size,
        pageCount: attachment.pageCount,
        blockIds: attachment.blockIds,
        convertedFromImage: attachment.convertedFromImage,
        originalFileName: attachment.originalFileName,
      };
    },
  );

  const rendered = await renderReportPdf({
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
    annex,
  });

  const fileName = reportFileName(report.title, locale);
  if (!annex) return { bytes: rendered.bytes, fileName };

  // Only the annex export needs the files themselves, so R2 is read here rather
  // than on every export.
  const withBytes = await Promise.all(
    attachments.map(async (attachment) => ({
      id: attachment._id!.toHexString(),
      fileName: attachment.fileName,
      bytes: await getObjectBuffer(attachment.storageKey),
    })),
  );

  return {
    bytes: await appendAnnexPages({
      reportPdf: rendered.bytes,
      attachments: withBytes,
      chipLinks: rendered.chipLinks,
    }),
    fileName,
  };
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
