"use client";

import { useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/client";

interface ShareManifest {
  reportFileName: string;
  reportUrl: string;
  reportUrlAnnex: string;
  files: { fileName: string; displayName: string; url: string }[];
}

/**
 * Hands the report to the device's share sheet, so the user picks their mail app
 * and one message carries everything.
 *
 * What is sent is the *annex* build: the evidence is inside the file, so the
 * recipient taps a reference and the document opens — on any device, offline, with
 * nothing else to keep alongside it.
 *
 * `mailto:` cannot carry attachments — that parameter is not standard and every
 * mail client ignores it — so the Web Share API is the only way a web page can put
 * real files into an email. Where it is unavailable (desktop Firefox and Safari)
 * the files are downloaded and an empty draft is opened to attach them to.
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
      const names = [manifest.reportFileName];

      /*
       * Email always sends the annex build: one self-contained file whose
       * references work by tapping, on any device, with no connection. A recipient
       * cannot be assumed to be at a computer, and separate attachments would lose
       * their relationship the moment they were saved somewhere else.
       *
       * Fetched before any mail app opens, so a failure cannot leave a half-built
       * draft behind.
       */
      const files = [
        await toFile(manifest.reportUrlAnnex, manifest.reportFileName),
      ];

      if (navigator.canShare?.({ files })) {
        await navigator.share({
          files,
          title: t.share.subject(title),
          text: t.share.body(title, names.map((name) => `• ${name}`).join("\n")),
        });
        return;
      }

      // No file sharing: hand over the same single file and an addressed draft.
      download(manifest.reportUrlAnnex, manifest.reportFileName);
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
