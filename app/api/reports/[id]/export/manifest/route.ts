import { handle, requireUser, toObjectId } from "@/lib/api";
import { bundleFileName, reportFileName } from "@/lib/pdf/bundle";
import { loadOwnedReport, loadReportAttachments } from "@/lib/reports/service";

/**
 * What a download or an email should contain: the report, plus every attachment
 * as its own file.
 *
 * The chips inside the PDF link to the attachment viewer in the app, which is
 * what makes them work on a phone. These files are the *offline* half of the
 * story — real PDFs the reader keeps, and the attachments an email carries.
 *
 * Attachments are addressed by id, so the URLs here never encode a storage
 * location.
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

    return {
      reportFileName: reportFileName(report.title, locale),
      reportUrlAnnex: `/api/reports/${reportId.toHexString()}/export?mode=annex`,
      reportUrl: `/api/reports/${reportId.toHexString()}/export`,
      files: attachments.map((attachment, index) => ({
        fileName: bundleFileName(index, attachment.fileName),
        displayName: attachment.fileName,
        url: `/api/attachments/${attachment._id!.toHexString()}/file?download=1`,
      })),
    };
  });
}
