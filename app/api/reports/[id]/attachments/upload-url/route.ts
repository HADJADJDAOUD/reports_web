import { z } from "zod";
import { badRequest, handle, parseBody, requireUser, toObjectId } from "@/lib/api";
import {
  extensionForKind,
  kindFromMimeType,
} from "@/lib/attachments/file-types";
import { env } from "@/lib/env";
import { loadOwnedReport } from "@/lib/reports/service";
import { uploadKey } from "@/lib/storage/keys";
import { presignUpload } from "@/lib/storage/r2";

const bodySchema = z.object({
  mimeType: z.string().min(3).max(120),
  size: z.number().int().positive(),
});

/**
 * Hands the browser a short-lived presigned PUT for one specific key. Uploading
 * directly to R2 keeps large evidence files away from the serverless request
 * body limit, and the R2 credentials stay on the server.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser();
    const reportId = toObjectId((await context.params).id, "report id");
    await loadOwnedReport(reportId, user.objectId);

    const { mimeType, size } = await parseBody(request, bodySchema);

    const kind = kindFromMimeType(mimeType);
    if (!kind) throw badRequest("Only PDF, JPG and PNG files are supported.");
    if (size > env.uploadMaxBytes) {
      throw badRequest(
        `File is larger than ${Math.round(env.uploadMaxBytes / (1024 * 1024))} MB.`,
      );
    }

    const key = uploadKey(
      reportId.toHexString(),
      "original",
      extensionForKind(kind),
    );
    const url = await presignUpload(key, mimeType);

    return { uploadUrl: url, storageKey: key };
  });
}
