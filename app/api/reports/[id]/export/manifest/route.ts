import { handle, requireUser, toObjectId } from "@/lib/api";
import { reportFileName } from "@/lib/pdf/bundle";
import { loadOwnedReport, loadReportAttachments } from "@/lib/reports/service";

/**
 * Returns the report PDF download information.
 * 
 * Attachments are now embedded directly in the PDF, so no separate file downloads are needed.
 * The exported PDF is self-contained and works offline.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const reportId = toObjectId((await context.params).id, "report id");
    const report = await loadOwnedReport(reportId, user.objectId);

    const locale = report.direction === "rtl" ? "ar" : "en";
    const id = reportId.toHexString();

    return {
      reportFileName: reportFileName(report.title, locale),
      reportUrl: `/api/reports/${id}/export`,
      // No separate files needed - attachments are embedded in the PDF
      files: [],
    };
  });
}
