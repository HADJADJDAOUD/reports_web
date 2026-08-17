/**
 * Whether this device needs the annex export.
 *
 * The distinction is not screen size but *what the PDF viewer can do*: phones and
 * tablets open a downloaded PDF through a sandboxed handle, so a tap can only
 * reach evidence that lives inside the same file. Coarse pointer plus no hover is
 * the honest signal for that class of device; a narrow desktop window is still a
 * desktop and keeps the clean, linked report.
 */
export function needsAnnexExport(): boolean {
  if (typeof window === "undefined") return false;
  const touchFirst = window.matchMedia?.(
    "(hover: none) and (pointer: coarse)",
  ).matches;
  return Boolean(touchFirst) || window.innerWidth < 640;
}
