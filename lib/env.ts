/**
 * Centralised, validated access to environment variables.
 *
 * Anything read here is server-only — none of these names are prefixed with
 * NEXT_PUBLIC_, so they can never leak into the client bundle.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. See .env.example.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

export const env = {
  get mongoUri() {
    return required("MONGODB_URI");
  },
  get mongoDb() {
    return optional("MONGODB_DB", "lexis");
  },
  get authSecret() {
    const secret = required("AUTH_SECRET");
    if (secret.length < 24) {
      throw new Error("AUTH_SECRET must be at least 24 characters long.");
    }
    return secret;
  },
  get sessionDays() {
    const days = Number(optional("AUTH_SESSION_DAYS", "30"));
    return Number.isFinite(days) && days > 0 ? days : 30;
  },
  get allowRegistration() {
    return optional("AUTH_ALLOW_REGISTRATION", "true") !== "false";
  },
  get r2() {
    const accountId = required("R2_ACCOUNT_ID");
    return {
      accountId,
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      bucket: required("R2_BUCKET"),
      endpoint: optional(
        "R2_ENDPOINT",
        `https://${accountId}.r2.cloudflarestorage.com`,
      ),
    };
  },
  get uploadMaxBytes() {
    const mb = Number(optional("UPLOAD_MAX_MB", "25"));
    return (Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024;
  },
  get pdfPageSize(): "A4" | "LETTER" {
    return optional("PDF_PAGE_SIZE", "A4").toUpperCase() === "LETTER"
      ? "LETTER"
      : "A4";
  },
  get pdfFooterText() {
    return optional("PDF_FOOTER_TEXT", "");
  },
};
