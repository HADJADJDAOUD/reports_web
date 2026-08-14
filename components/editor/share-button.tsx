"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/client";

interface ShareManifest {
  reportFileName: string;
  reportUrlFlat: string;
  files: { fileName: string; displayName: string; url: string }[];
}

/**
 * Hands the report and its evidence to the device's share sheet, so the user can
 * pick their mail app and send everything in one message.
 *
 * `mailto:` cannot carry attachments — the `attachment` parameter is not part of
 * the standard and every mail client ignores it — so the Web Share API is the only
 * way a web page can put real files into an email. Where it is unavailable
 * (desktop Firefox and Safari, mostly) the files are downloaded and an empty draft
 * is opened for the user to attach them to.
 *
 * The report is fetched with **flat** links, because email attachments all land in
 * one folder on the recipient's machine — there is no folder to point into.
 */
export function ShareButton({
  reportId,
  reportTitle,
  attachmentCount,
  beforeShare,
}: {
  reportId: string;
  reportTitle: string;
  attachmentCount: number;
  beforeShare: () => Promise<void>;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toFile(url: string, fileName: string): Promise<File> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(t.share.failed);
    return new File([await response.blob()], fileName, {
      type: "application/pdf",
    });
  }

  function openDraft(title: string, fileNames: string[]): void {
    const subject = encodeURIComponent(t.share.subject(title));
    const body = encodeURIComponent(
      t.share.body(title, fileNames.map((name) => `• ${name}`).join("\n")),
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function download(url: string, fileName: string): void {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      await beforeShare();

      const response = await fetch(`/api/reports/${reportId}/export/manifest`);
      if (!response.ok) throw new Error(t.share.failed);
      const manifest = (await response.json()) as ShareManifest;

      const title = reportTitle.trim() || manifest.reportFileName;
      const names = [
        manifest.reportFileName,
        ...manifest.files.map((file) => file.fileName),
      ];

      // Files first, so a failure happens before any mail app is opened.
      const files = [
        await toFile(manifest.reportUrlFlat, manifest.reportFileName),
        ...(await Promise.all(
          manifest.files.map((file) => toFile(file.url, file.fileName)),
        )),
      ];

      if (navigator.canShare?.({ files })) {
        await navigator.share({
          files,
          title: t.share.subject(title),
          text: t.share.body(title, names.map((name) => `• ${name}`).join("\n")),
        });
        return;
      }

      // No file sharing: give the user the files and an addressed draft.
      download(manifest.reportUrlFlat, manifest.reportFileName);
      for (const file of manifest.files) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        download(file.url, file.fileName);
      }
      openDraft(title, names);
      setMessage(t.share.fallback);
    } catch (caught) {
      // Dismissing the share sheet is a choice, not a failure.
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      const tooLarge =
        caught instanceof DOMException && caught.name === "NotAllowedError";
      setMessage(tooLarge ? t.share.tooLarge : t.share.failed);
    } finally {
      setBusy(false);
    }
  }

  // Sharing a report with no evidence is just sending a PDF; Export covers that.
  if (attachmentCount === 0) return null;

  return (
    <div className="relative">
      <Button variant="secondary" onClick={run} disabled={busy} aria-busy={busy}>
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Mail className="size-4" aria-hidden />
        )}
        <span className="hidden sm:inline">
          {busy ? t.editor.sharing : t.editor.share}
        </span>
      </Button>

      {message && (
        <p
          role="status"
          className="animate-fade-in font-ui absolute end-0 top-full z-40 mt-2 w-72 rounded border border-line bg-paper p-3 text-xs leading-relaxed text-ink-soft shadow-[0_6px_20px_rgba(26,28,28,0.12)]"
          onClick={() => setMessage(null)}
        >
          {message}
        </p>
      )}
    </div>
  );
}
