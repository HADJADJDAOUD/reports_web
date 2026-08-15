"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/client";

interface ShareManifest {
  reportFileName: string;
  reportUrl: string;
  files: never[]; // No separate files - attachments are embedded
}

/**
 * Hands the report PDF to the device's share sheet.
 *
 * Since attachments are now embedded in the PDF, only a single file needs to be shared.
 */
export function ShareButton({
  reportId,
  reportTitle,
  beforeShare,
}: {
  reportId: string;
  reportTitle: string;
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
      const file = await toFile(manifest.reportUrl, manifest.reportFileName);

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: t.share.subject(title),
          text: t.share.body(title, [manifest.reportFileName]),
        });
        return;
      }

      // No file sharing: download the PDF and open a mail draft
      download(manifest.reportUrl, manifest.reportFileName);
      openDraft(title, [manifest.reportFileName]);
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
