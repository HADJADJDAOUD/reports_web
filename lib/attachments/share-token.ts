import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * A signed, unguessable token that grants read access to one attachment.
 *
 * The exported report is meant to be *sent* — to a court, a client, an insurer.
 * Those readers have no account here, so a link that depends on the author's
 * session would show them a login page instead of the evidence. This token is
 * what makes a reference in a shared PDF openable by whoever holds that PDF, on
 * any device, with no sign-in.
 *
 * It is derived from the attachment id with an HMAC over `AUTH_SECRET`, so:
 *  - it cannot be guessed or forged without the server secret,
 *  - it grants access to that one attachment and nothing else,
 *  - it needs no database table and stays valid as long as the file exists.
 *
 * The security model is therefore the same as a Dropbox or DocuSign share link:
 * holding the link is the permission. That is the intent — the PDF and its
 * evidence are one package. Rotating `AUTH_SECRET` invalidates every issued link.
 */
export function attachmentToken(attachmentId: string): string {
  return createHmac("sha256", env.authSecret)
    .update(`attachment:${attachmentId}`)
    .digest("base64url")
    .slice(0, 32);
}

/** Constant-time check, so a wrong token leaks nothing through timing. */
export function isValidAttachmentToken(
  attachmentId: string,
  token: string | null | undefined,
): boolean {
  if (!token) return false;
  const expected = Buffer.from(attachmentToken(attachmentId));
  const given = Buffer.from(token);
  if (expected.byteLength !== given.byteLength) return false;
  return timingSafeEqual(expected, given);
}
