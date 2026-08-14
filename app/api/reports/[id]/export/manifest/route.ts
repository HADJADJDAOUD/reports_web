import { handle, requireUser, toObjectId } from "@/lib/api";
import {
  attachmentsDirName,
  bundleFileName,
  reportFileName,
} from "@/lib/pdf/bundle";
import { loadOwnedReport, loadReportAttachments } from "@/lib/reports/service";

/**
 * Tells the browser exactly which files to save, and under which names, so the
 * report's relative links land on real siblings in the downloads folder.
 *
 * The names come from `lib/pdf/bundle.ts`, the same helper the renderer used to
 * write the links — they must not drift apart.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const reportId = toObjectId((await context.params).id, "report id");
    const report = await loadOwnedReport(reportId, user.objectId);
    const attachments = await loadReportAttachments(reportId, user.objectId);

    const locale = report.direction === "rtl" ? "ar" : "en";
    const id = reportId.toHexString();

    return {
      reportFileName: reportFileName(report.title, locale),
      // The layout must match what the client is about to write to disk.
      reportUrlFolder: `/api/reports/${id}/export?layout=folder`,
      reportUrlFlat: `/api/reports/${id}/export?layout=flat`,
      attachmentsDir: attachmentsDirName(report.title, id),
      files: attachments.map((attachment, index) => ({
        fileName: bundleFileName(index, attachment.fileName),
        displayName: attachment.fileName,
        url: `/api/reports/${id}/attachments/${attachment._id!.toHexString()}/file?bundle=1`,
      })),
    };
  });
}
