import { z } from "zod";
import { handle, notFound, parseBody, requireUser, toObjectId } from "@/lib/api";
import { attachments } from "@/lib/db/mongo";
import { removeEvidenceFiles } from "@/lib/attachments/service";
import { loadOwnedReport, toAttachmentDto } from "@/lib/reports/service";

const patchSchema = z
  .object({
    description: z.string().max(300).optional(),
    blockIds: z
      .array(z.string().regex(/^[A-Za-z0-9_-]{6,24}$/))
      .max(20)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

type RouteContext = {
  params: Promise<{ id: string; attachmentId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return handle(async () => {
    const user = await requireUser();
    const { id, attachmentId } = await context.params;
    const reportId = toObjectId(id, "report id");
    const fileId = toObjectId(attachmentId, "attachment id");
    await loadOwnedReport(reportId, user.objectId);

    const body = await parseBody(request, patchSchema);
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.description !== undefined)
      update.description = body.description.trim();
    if (body.blockIds !== undefined)
      update.blockIds = [...new Set(body.blockIds)];

    const result = await (await attachments()).findOneAndUpdate(
      { _id: fileId, reportId, ownerId: user.objectId },
      { $set: update },
      { returnDocument: "after" },
    );
    if (!result) throw notFound("Attachment not found");

    return { attachment: toAttachmentDto(result) };
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  return handle(async () => {
    const user = await requireUser();
    const { id, attachmentId } = await context.params;
    const reportId = toObjectId(id, "report id");
    const fileId = toObjectId(attachmentId, "attachment id");
    await loadOwnedReport(reportId, user.objectId);

    const existing = await (await attachments()).findOneAndDelete({
      _id: fileId,
      reportId,
      ownerId: user.objectId,
    });
    if (!existing) throw notFound("Attachment not found");

    await removeEvidenceFiles([existing.storageKey]);
    return { ok: true as const };
  });
}
