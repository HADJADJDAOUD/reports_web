import { z } from "zod";
import { ApiError, handle, parseBody } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";
import { users } from "@/lib/db/mongo";

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  return handle(async () => {
    const { email, password } = await parseBody(request, bodySchema);

    const user = await (await users()).findOne({ email });
    // Same message for unknown email and wrong password — no account probing.
    const invalid = new ApiError(401, "Incorrect email or password.");
    if (!user) throw invalid;
    if (!(await verifyPassword(password, user.passwordHash))) throw invalid;

    await createSessionCookie({
      userId: user._id!.toHexString(),
      email: user.email,
      name: user.name,
    });

    return { ok: true as const };
  });
}
