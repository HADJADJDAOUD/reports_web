import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth/session";
import { exportReportPdf } from "@/lib/pdf/export";
import { loadOwnedReport, loadReportAttachments } from "@/lib/reports/service";

// PDFKit and the font files need the Node runtime, not the edge runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session || !ObjectId.isValid(session.userId)) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const ownerId = new ObjectId(session.userId);
  const reportId = new ObjectId(id);

  try {
    const report = await loadOwnedReport(reportId, ownerId);
    const attachments = await loadReportAttachments(reportId, ownerId);

    // The layout decides what the chips link to, so the client states which one
    // it is about to write: a folder where the browser can create one, otherwise
    // files side by side.
    const exported = await exportReportPdf({
      report,
      attachments,
      // Page numbers and footers follow the document's own direction, so an
      // Arabic report reads as one throughout.
      locale: report.direction === "rtl" ? "ar" : "en",
      authorName: session.name || session.email,
      layout:
        new URL(request.url).searchParams.get("layout") === "flat"
          ? "flat"
          : "folder",
    });

    return new NextResponse(new Uint8Array(exported.bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(exported.bytes.byteLength),
        "content-disposition": `attachment; filename="report.pdf"; filename*=UTF-8''${encodeURIComponent(exported.fileName)}`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const status =
      error && typeof error === "object" && "status" in error
        ? Number((error as { status: unknown }).status) || 500
        : 500;
    if (status === 404) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    console.error("Report export failed", error);
    return NextResponse.json(
      { error: "Export failed. Please try again." },
      { status: 500 },
    );
  }
}
