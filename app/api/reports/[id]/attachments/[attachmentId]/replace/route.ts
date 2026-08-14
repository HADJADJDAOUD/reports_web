import { z } from "zod";
import {
  badRequest,
  handle,
  notFound,
  parseBody,
  requireUser,
  toObjectId,
} from "@/lib/api";
import { attachments } from "@/lib/db/mongo";
import {
  removeEvidenceFiles,
  storeEvidenceFromUpload,
} from "@/lib/attachments/service";
import { loadOwnedReport, toAttachmentDto } from "@/lib/reports/service";

const bodySchema = z.object({
  storageKey: z.string().min(8).max(300),
  fileName: z.string().min(1).max(300),
  mimeType: z.string().min(3).max(120),
});

/**
 * Swaps the file behind an existing attachment while keeping its id, its
 * description and — most importantly — its links to document blocks.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; attachmentId: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const { id, attachmentId } = await context.params;
    const reportId = toObjectId(id, "report id");
    const fileId = toObjectId(attachmentId, "attachment id");
    await loadOwnedReport(reportId, user.objectId);

    const body = await parseBody(request, bodySchema);
    if (
      !body.storageKey.startsWith(`reports/${reportId.toHexString()}/original/`)
    ) {
      throw badRequest("Unexpected storage key");
    }

    const collection = await attachments();
    const existing = await collection.findOne({
      _id: fileId,
      reportId,
      ownerId: user.objectId,
    });
    if (!existing) throw notFound("Attachment not found");

    const stored = await storeEvidenceFromUpload({
      reportId: reportId.toHexString(),
      originalKey: body.storageKey,
      originalFileName: body.fileName,
      declaredMimeType: body.mimeType,
    });

    const updated = await collection.findOneAndUpdate(
      { _id: fileId, reportId, ownerId: user.objectId },
      { $set: { ...stored, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) throw notFound("Attachment not found");

    // Only drop the previous file once the new one is safely recorded.
    if (existing.storageKey !== stored.storageKey) {
      await removeEvidenceFiles([existing.storageKey]);
    }

    return { attachment: toAttachmentDto(updated) };
  });
}
