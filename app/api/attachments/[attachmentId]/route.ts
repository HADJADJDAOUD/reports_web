import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth/session";
import { loadOwnedAttachment } from "@/lib/reports/service";

/**
 * Returns attachment metadata by ID.
 * Used by the attachment viewer to display file information.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ attachmentId: string }> },
) {
  const session = await getSession();
  if (!session || !ObjectId.isValid(session.userId)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { attachmentId } = await context.params;
  if (!ObjectId.isValid(attachmentId)) {
    return new NextResponse("Not found", { status: 404 });
  }

  let attachment;
  try {
    attachment = await loadOwnedAttachment(
      new ObjectId(attachmentId),
      new ObjectId(session.userId),
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
