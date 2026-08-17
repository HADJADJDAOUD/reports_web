import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth/session";
import { exportReportPdf } from "@/lib/pdf/export";
import { loadOwnedReport, loadReportAttachments } from "@/lib/reports/service";

// PDFKit and the font files need the Node runtime, not the edge runtime.
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * The public origin to write into the exported PDF's links.
 *
 * Behind Vercel's proxy the request URL is the internal one, so the forwarded
 * headers are the reliable source. `NEXT_PUBLIC_APP_URL` overrides both when the
 * app sits behind a custom domain that the headers do not reflect.
 */
function deploymentOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured;

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto") ??
      (host.startsWith("localhost") ? "http" : "https");
    return `${proto}://${host}`;
  }
  return new URL(request.url).origin;
}

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

    const exported = await exportReportPdf({
      report,
      attachments,
      // Page numbers and footers follow the document's own direction, so an
      // Arabic report reads as one throughout.
      locale: report.direction === "rtl" ? "ar" : "en",
      authorName: session.name || session.email,
      baseUrl: deploymentOrigin(request),
      // The client knows its device; a phone needs the annex export.
      mode:
        new URL(request.url).searchParams.get("mode") === "annex"
          ? "annex"
          : "link",
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
