import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth/session";
import { isValidAttachmentToken } from "@/lib/attachments/share-token";
import {
  loadAttachmentById,
  loadOwnedAttachment,
} from "@/lib/reports/service";
import { getObjectBuffer } from "@/lib/storage/r2";

/**
 * Serves an attachment addressed by its own id.
 *
 * The id is the only stable handle a reference should ever carry: the bucket, the
 * storage key and the report it belongs to are all resolved here, so a reference
 * never encodes a physical location and keeps working if storage changes.
 *
 * The report-scoped route (`/api/reports/:id/attachments/:aid/file`) is untouched;
 * the editor still uses it.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await context.params;
  if (!ObjectId.isValid(attachmentId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  /*
   * Two ways in: the owner's session, or a signed share token from a link inside
   * an exported report. The token is what lets a recipient with no account open
   * the evidence — see lib/attachments/share-token.ts.
   */
  const token = new URL(request.url).searchParams.get("t");
  const shared = isValidAttachmentToken(attachmentId, token);
  const session = shared ? null : await getSession();
  if (!shared && (!session || !ObjectId.isValid(session.userId))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let attachment;
  try {
    attachment = shared
      ? await loadAttachmentById(new ObjectId(attachmentId))
      : await loadOwnedAttachment(
          new ObjectId(attachmentId),
          new ObjectId(session!.userId),
        );
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await getObjectBuffer(attachment.storageKey);
  } catch (error) {
    console.error("Failed to read attachment from R2", error);
    return new NextResponse("Attachment unavailable", { status: 502 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const encodedName = encodeURIComponent(attachment.fileName);
  const asciiName = /^[\x20-\x7E]+$/.test(attachment.fileName)
    ? attachment.fileName
    : "attachment.pdf";

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-length": String(bytes.byteLength),
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      // Private, but cacheable by the browser so a re-open is instant.
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
