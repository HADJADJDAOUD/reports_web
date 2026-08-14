import { randomUUID } from "node:crypto";

/**
 * Storage keys are always generated server-side and never derived from
 * user-supplied file names, so an upload cannot escape its report prefix.
 */
export function uploadKey(
  reportId: string,
  kind: "original" | "pdf",
  extension: string,
): string {
  const safeExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return `reports/${reportId}/${kind}/${randomUUID()}.${safeExtension || "bin"}`;
}

export function reportPrefix(reportId: string): string {
  return `reports/${reportId}/`;
}
