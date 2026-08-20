"use client";

import { useState } from "react";
import { Download, FileDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/client";

interface ExportManifest {
  reportFileName: string;
  reportUrl: string;
  reportUrlAnnex: string;
  files: { fileName: string; displayName: string; url: string }[];
}

type Result = "pdf";

/**
 * Saves the report as a self-contained PDF.
 *
 * Attachments are embedded directly in the PDF, so the exported file works
 * completely offline without any external dependencies.
 */
export function ExportButton({
  reportId,
  beforeExport,
}: {
  reportId: string;
  beforeExport: () => Promise<void>;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await beforeExport();

      const response = await fetch(`/api/reports/${reportId}/export/manifest`);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? t.export.failed);
      }
      const manifest = (await response.json()) as ExportManifest;

      const save = (url: string, fileName: string) => {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = fileName;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      };

      /*
       * One self-contained file on every device. The evidence sits behind the
       * report and each reference jumps to it, so a click works with no
       * connection — on a laptop as much as on a phone — and there is a single
       * file to keep, send or file away.
       */
      save(manifest.reportUrlAnnex, manifest.reportFileName);

      setResult("pdf");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.export.failed);
    } finally {
      setBusy(false);
    }
  }

  const note = result === "pdf" ? t.export.note : null;

  return (
    <div className="relative flex items-center gap-2">
      {error && (
        <span role="alert" className="font-ui text-xs text-danger">
          {error}
        </span>
      )}
      <Button variant="primary" onClick={run} disabled={busy} aria-busy={busy}>
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : result ? (
          <Download className="size-4" aria-hidden />
        ) : (
          <FileDown className="size-4" aria-hidden />
        )}
        {busy ? t.editor.exporting : t.editor.export}
      </Button>

      {/*
        The exported PDF is self-contained with embedded attachments.
      */}
      {note && !error && (
        <div className="animate-fade-in absolute end-0 top-full z-40 mt-2 w-80 rounded border border-line bg-paper p-3 shadow-[0_6px_20px_rgba(26,28,28,0.12)]">
          <div className="flex items-start gap-2">
            <Download
              className="mt-0.5 size-3.5 shrink-0 text-evidence"
              aria-hidden
            />
            <p className="font-ui text-xs leading-relaxed text-ink-soft">
              {note}
            </p>
            <button
              type="button"
              onClick={() => setResult(null)}
              aria-label={t.attach.close}
              className="-me-1 -mt-1 grid size-6 shrink-0 place-items-center rounded text-ink-faint hover:bg-surface-high hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
