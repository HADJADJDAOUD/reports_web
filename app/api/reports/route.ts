import { z } from "zod";
import { handle, parseBody, requireUser } from "@/lib/api";
import { attachments, reports } from "@/lib/db/mongo";
import { EMPTY_DOC } from "@/lib/doc/schema";
import { toReportDto } from "@/lib/reports/service";

const createSchema = z.object({
  title: z.string().trim().max(300).optional(),
  direction: z.enum(["rtl", "ltr"]).optional(),
});

export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const list = await (await reports())
      .find({ ownerId: user.objectId })
      .sort({ updatedAt: -1 })
      .limit(200)
      .toArray();

    const counts = await (await attachments())
      .aggregate<{ _id: typeof user.objectId; count: number }>([
        { $match: { ownerId: user.objectId } },
        { $group: { _id: "$reportId", count: { $sum: 1 } } },
      ])
      .toArray();
    const countByReport = new Map(
      counts.map((entry) => [entry._id.toHexString(), entry.count]),
    );

    return {
      reports: list.map((report) => {
        const dto = toReportDto(report);
        return {
          id: dto.id,
          title: dto.title,
          direction: dto.direction,
          updatedAt: dto.updatedAt,
          attachmentCount: countByReport.get(dto.id) ?? 0,
        };
      }),
    };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(request, createSchema);
    const now = new Date();

    const result = await (await reports()).insertOne({
      ownerId: user.objectId,
      title: body.title?.trim() ?? "",
      subtitle: "",
      direction: body.direction ?? "ltr",
      content: EMPTY_DOC,
      createdAt: now,
      updatedAt: now,
    });

    return { id: result.insertedId.toHexString() };
  });
}
