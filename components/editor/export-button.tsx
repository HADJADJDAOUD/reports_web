"use client";

import { useState } from "react";
import { Download, FileDown, FolderDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n/client";

interface ExportManifest {
  reportFileName: string;
  reportUrlFolder: string;
  reportUrlFlat: string;
  attachmentsDir: string;
  files: { fileName: string; displayName: string; url: string }[];
}

type Result = "folder" | "flat" | "pdf";

/**
 * Saves the report and its evidence as
 *
 *     تقرير.pdf
 *     attachments-…/01-receipt.pdf, 02.pdf, …
 *
 * The chips in the report are relative links into that folder, so the layout on
 * disk is what makes them work.
 *
 * Ordinary downloads cannot create a folder: every browser strips path separators
 * out of the `download` attribute, and Chromium has declined to change that. So
 * where the File System Access API exists (Chrome, Edge) the files are written
 * straight into a folder the user picks. Everywhere else they are downloaded side
 * by side instead, and the report is rendered with matching flat links — never a
 * ZIP, because nobody should have to unpack anything.
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

  async function fetchBlob(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(t.export.failed);
    return response.blob();
  }

  function saveViaDownload(url: string, fileName: string): void {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function writeFile(
    directory: FileSystemDirectoryHandle,
    fileName: string,
    blob: Blob,
  ): Promise<void> {
    const handle = await directory.getFileHandle(fileName, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  }

  /** Returns false when the browser has no directory picker. */
  async function saveIntoFolder(manifest: ExportManifest): Promise<boolean> {
    if (typeof window.showDirectoryPicker !== "function") return false;

    const root = await window.showDirectoryPicker({
      mode: "readwrite",
      id: "lexis-export",
      startIn: "downloads",
    });

    await writeFile(
      root,
      manifest.reportFileName,
      await fetchBlob(manifest.reportUrlFolder),
    );

    if (manifest.files.length > 0) {
      const folder = await root.getDirectoryHandle(manifest.attachmentsDir, {
        create: true,
      });
      for (const file of manifest.files) {
        await writeFile(folder, file.fileName, await fetchBlob(file.url));
      }
    }
    return true;
  }

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

      // A report with no evidence is just a PDF; there is no folder to make.
      if (manifest.files.length === 0) {
        saveViaDownload(manifest.reportUrlFlat, manifest.reportFileName);
        setResult("pdf");
        return;
      }

      if (await saveIntoFolder(manifest)) {
        setResult("folder");
        return;
      }

      // No directory access: download everything side by side. The report is
      // fetched with flat links so they match where the files actually land.
      saveViaDownload(manifest.reportUrlFlat, manifest.reportFileName);
      for (const file of manifest.files) {
        // Browsers drop downloads fired in the same tick, so they are spaced out.
        await new Promise((resolve) => setTimeout(resolve, 400));
        saveViaDownload(file.url, file.fileName);
      }
      setResult("flat");
    } catch (caught) {
      // Dismissing the folder picker is a choice, not a failure.
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : t.export.failed);
    } finally {
      setBusy(false);
    }
  }

  const note =
    result === "flat"
      ? t.export.noteFlat
      : result === "folder"
        ? t.export.note
        : null;

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
        The layout on disk is the one thing the reader must not break, so it is
        stated once, right after the export.
      */}
      {note && !error && (
        <div className="animate-fade-in absolute end-0 top-full z-40 mt-2 w-80 rounded border border-line bg-paper p-3 shadow-[0_6px_20px_rgba(26,28,28,0.12)]">
          <div className="flex items-start gap-2">
            <FolderDown
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
