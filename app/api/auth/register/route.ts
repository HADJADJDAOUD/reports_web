import { z } from "zod";
import { ApiError, badRequest, handle, parseBody } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";
import { users } from "@/lib/db/mongo";
import { env } from "@/lib/env";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(8).max(200),
});

export async function POST(request: Request) {
  return handle(async () => {
    if (!env.allowRegistration) {
      throw new ApiError(403, "Registration is currently closed.");
    }
    const { name, email, password } = await parseBody(request, bodySchema);

    const collection = await users();
    const existing = await collection.findOne({ email });
    if (existing) {
      throw badRequest("An account with this email already exists.");
    }

    const passwordHash = await hashPassword(password);
    const result = await collection.insertOne({
      email,
      name,
      passwordHash,
      createdAt: new Date(),
    });

    await createSessionCookie({
      userId: result.insertedId.toHexString(),
      email,
      name,
    });

    return { ok: true as const };
  });
}
