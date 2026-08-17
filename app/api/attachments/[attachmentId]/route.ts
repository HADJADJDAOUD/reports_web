import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth/session";
import { isValidAttachmentToken } from "@/lib/attachments/share-token";
import {
  loadAttachmentById,
  loadOwnedAttachment,
} from "@/lib/reports/service";

/**
 * Returns attachment metadata by ID.
 * Used by the attachment viewer to display file information.
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

  return NextResponse.json({
    id: attachment._id!.toHexString(),
    fileName: attachment.fileName,
    originalFileName: attachment.originalFileName,
    size: attachment.size,
    pageCount: attachment.pageCount,
    convertedFromImage: attachment.convertedFromImage,
  });
}
