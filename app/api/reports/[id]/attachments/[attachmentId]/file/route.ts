import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth/session";
import { attachments } from "@/lib/db/mongo";
import { bundleFileName } from "@/lib/pdf/bundle";
import { loadReportAttachments } from "@/lib/reports/service";
import { getObjectBuffer } from "@/lib/storage/r2";

/**
 * Streams an attachment's PDF for in-app preview.
 *
 * The R2 bucket stays private: bytes are proxied through this route so that
 * ownership is checked on every read and no public object URL ever exists.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const session = await getSession();
  if (!session || !ObjectId.isValid(session.userId)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { id, attachmentId } = await context.params;
  if (!ObjectId.isValid(id) || !ObjectId.isValid(attachmentId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const reportId = new ObjectId(id);
  const ownerId = new ObjectId(session.userId);

  const attachment = await (await attachments()).findOne({
    _id: new ObjectId(attachmentId),
    reportId,
    ownerId,
  });
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const url = new URL(request.url);

  /**
   * `bundle=1` is the export flow: the file must be saved under exactly the name
   * the report's relative link points at, so its position in the report's own
   * ordering decides the name — never anything the caller supplies.
   */
  let downloadName = attachment.fileName;
  if (url.searchParams.get("bundle") === "1") {
    const siblings = await loadReportAttachments(reportId, ownerId);
    const index = siblings.findIndex(
      (item) => item._id!.toHexString() === attachmentId,
    );
    downloadName = bundleFileName(
      index === -1 ? 0 : index,
      attachment.fileName,
    );
  }

  let bytes: Buffer;
  try {
    bytes = await getObjectBuffer(attachment.storageKey);
  } catch (error) {
    console.error("Failed to read attachment from R2", error);
    return new NextResponse("Attachment unavailable", { status: 502 });
  }

  const asDownload =
    url.searchParams.get("download") === "1" ||
    url.searchParams.get("bundle") === "1";
  const encodedName = encodeURIComponent(downloadName);
  // ASCII fallback for readers that ignore the RFC 5987 form.
  const asciiName = /^[\x20-\x7E]+$/.test(downloadName)
    ? downloadName
    : "attachment.pdf";

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.byteLength),
      "content-disposition": `${asDownload ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "cache-control": "private, max-age=60",
      "x-content-type-options": "nosniff",
    },
  });
}
