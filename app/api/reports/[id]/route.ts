import { z } from "zod";
import { handle, notFound, parseBody, requireUser, toObjectId } from "@/lib/api";
import { attachments, reports } from "@/lib/db/mongo";
import { docSchema } from "@/lib/doc/schema";
import {
  loadOwnedReport,
  loadReportAttachments,
  toAttachmentDto,
  toReportDto,
} from "@/lib/reports/service";
import { deleteObjects } from "@/lib/storage/r2";

const patchSchema = z
  .object({
    title: z.string().max(300).optional(),
    subtitle: z.string().max(300).optional(),
    direction: z.enum(["rtl", "ltr"]).optional(),
    content: docSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Nothing to update");

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  return handle(async () => {
    const user = await requireUser();
    const reportId = toObjectId((await context.params).id, "report id");
    const report = await loadOwnedReport(reportId, user.objectId);
    const files = await loadReportAttachments(reportId, user.objectId);
    return {
      report: toReportDto(report),
      attachments: files.map(toAttachmentDto),
    };
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return handle(async () => {
    const user = await requireUser();
    const reportId = toObjectId((await context.params).id, "report id");
    const body = await parseBody(request, patchSchema);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title !== undefined) update.title = body.title.slice(0, 300);
    if (body.subtitle !== undefined)
      update.subtitle = body.subtitle.slice(0, 300);
    if (body.direction !== undefined) update.direction = body.direction;
    if (body.content !== undefined) update.content = body.content;

    const result = await (await reports()).findOneAndUpdate(
      { _id: reportId, ownerId: user.objectId },
      { $set: update },
      { returnDocument: "after" },
    );
    if (!result) throw notFound("Report not found");

    return { report: toReportDto(result) };
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  return handle(async () => {
    const user = await requireUser();
    const reportId = toObjectId((await context.params).id, "report id");
    await loadOwnedReport(reportId, user.objectId);

    const files = await loadReportAttachments(reportId, user.objectId);
    await deleteObjects(files.map((file) => file.storageKey));
    await (await attachments()).deleteMany({
      reportId,
      ownerId: user.objectId,
    });
    await (await reports()).deleteOne({ _id: reportId, ownerId: user.objectId });

    return { ok: true as const };
  });
}
