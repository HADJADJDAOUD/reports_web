import { z } from "zod";
import { badRequest, handle, parseBody, requireUser, toObjectId } from "@/lib/api";
import { attachments } from "@/lib/db/mongo";
import { storeEvidenceFromUpload } from "@/lib/attachments/service";
import { sanitizeFileName } from "@/lib/attachments/file-types";
import { getDictionary } from "@/lib/i18n/dictionaries";
import {
  loadOwnedReport,
  loadReportAttachments,
  toAttachmentDto,
} from "@/lib/reports/service";

const blockIdSchema = z.string().regex(/^[A-Za-z0-9_-]{6,24}$/);

const createSchema = z.object({
  storageKey: z.string().min(8).max(300),
  fileName: z.string().min(1).max(300),
  mimeType: z.string().min(3).max(120),
  blockIds: z.array(blockIdSchema).min(1).max(20),
  /** What the author called it. Blank means "number it for me". */
  displayName: z.string().max(120).optional(),
  description: z.string().max(300).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  return handle(async () => {
    const user = await requireUser();
    const reportId = toObjectId((await context.params).id, "report id");
    await loadOwnedReport(reportId, user.objectId);
    const files = await loadReportAttachments(reportId, user.objectId);
    return { attachments: files.map(toAttachmentDto) };
  });
}

/**
 * Finalises an upload: reads back what landed in R2, validates it, converts
 * images to PDF, and records the metadata linked to the given block ids.
 */
export async function POST(request: Request, context: RouteContext) {
  return handle(async () => {
    const user = await requireUser();
    const reportId = toObjectId((await context.params).id, "report id");
    const report = await loadOwnedReport(reportId, user.objectId);
    const existingCount = (
      await loadReportAttachments(reportId, user.objectId)
    ).length;

    const body = await parseBody(request, createSchema);

    // The key must belong to this report — a client cannot point at another
    // report's uploads.
    const expectedPrefix = `reports/${reportId.toHexString()}/original/`;
    if (!body.storageKey.startsWith(expectedPrefix)) {
      throw badRequest("Unexpected storage key");
    }

    const stored = await storeEvidenceFromUpload({
      reportId: reportId.toHexString(),
      originalKey: body.storageKey,
      originalFileName: body.fileName,
      declaredMimeType: body.mimeType,
    });

    /*
     * The name is what the reader sees on the chip and in the evidence rail, so
     * the author chooses it. Left blank it is numbered in citation order, which
     * is how exhibits are referred to anyway.
     */
    const chosen = sanitizeFileName(body.displayName ?? "", "");
    const fileName = chosen
      ? chosen + ".pdf"
      : getDictionary(report.direction === "rtl" ? "ar" : "en").attach
          .defaultName(existingCount + 1) + ".pdf";

    const now = new Date();
    const doc = {
      reportId,
      ownerId: user.objectId,
      blockIds: [...new Set(body.blockIds)],
      description: body.description?.trim() ?? "",
      status: "ready" as const,
      createdAt: now,
      updatedAt: now,
      ...stored,
      fileName,
    };
    const result = await (await attachments()).insertOne(doc);

    return { attachment: toAttachmentDto({ ...doc, _id: result.insertedId }) };
  });
}
