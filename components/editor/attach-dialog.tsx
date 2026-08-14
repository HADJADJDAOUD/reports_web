"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fill, useLocale } from "@/lib/i18n/client";
import {
  ACCEPT_ATTRIBUTE,
  formatBytes,
  kindFromMimeType,
} from "@/lib/attachments/file-types";
import type { AttachmentDto } from "@/lib/reports/service";

type Phase = "idle" | "uploading" | "processing";

export interface AttachDialogProps {
  reportId: string;
  /** Block the evidence will be linked to, or the attachment being replaced. */
  target: { kind: "block"; blockId: string } | { kind: "replace"; attachmentId: string };
  maxBytes: number;
  onClose: () => void;
  onDone: (attachment: AttachmentDto) => void;
}

/**
 * Upload flow: presign → PUT straight to R2 → finalise on the server (validate,
 * convert images to PDF, record the block link).
 */
export function AttachDialog({
  reportId,
  target,
  maxBytes,
  onClose,
  onDone,
}: AttachDialogProps) {
  const { t } = useLocale();
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const maxMb = Math.round(maxBytes / (1024 * 1024));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && phase === "idle") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, phase]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function pick(next: File | null) {
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    if (!kindFromMimeType(next.type)) {
      setError(t.attach.invalidType);
      setFile(null);
      return;
    }
    if (next.size > maxBytes) {
      setError(fill(t.attach.tooLarge, { max: maxMb }));
      setFile(null);
      return;
    }
    setFile(next);
  }

  async function submit() {
    if (!file) return;
    setPhase("uploading");
    setError(null);

    try {
      const presignResponse = await fetch(
        `/api/reports/${reportId}/attachments/upload-url`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mimeType: file.type, size: file.size }),
        },
      );
      if (!presignResponse.ok) throw await toError(presignResponse);
      const { uploadUrl, storageKey } = (await presignResponse.json()) as {
        uploadUrl: string;
        storageKey: string;
      };

      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "content-type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error(t.attach.failed);

      setPhase("processing");

      const endpoint =
        target.kind === "block"
          ? `/api/reports/${reportId}/attachments`
          : `/api/reports/${reportId}/attachments/${target.attachmentId}/replace`;
      const payload =
        target.kind === "block"
          ? {
              storageKey,
              fileName: file.name,
              mimeType: file.type,
              blockIds: [target.blockId],
              description: description.trim(),
            }
          : { storageKey, fileName: file.name, mimeType: file.type };

      const finalize = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!finalize.ok) throw await toError(finalize);

      const { attachment } = (await finalize.json()) as {
        attachment: AttachmentDto;
      };
      onDone(attachment);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t.attach.failed);
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  const isImage = file ? file.type.startsWith("image/") : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/25 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.attach.title}
        className="animate-fade-in w-full max-w-md rounded-lg border border-line bg-paper p-5 shadow-[0_8px_28px_rgba(26,28,28,0.12)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-ui text-base font-medium">{t.attach.title}</h2>
            <p className="mt-0.5 text-xs text-ink-soft">
              {target.kind === "block" ? t.attach.forBlock : t.attach.replace}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t.attach.close}
            className="grid size-7 place-items-center rounded text-ink-faint hover:bg-surface-high hover:text-ink disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        <label
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded border border-dashed px-4 py-6 text-center transition-colors ${
            file
              ? "border-evidence/40 bg-evidence/5"
              : "border-line-strong hover:border-ink hover:bg-surface"
          }`}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!busy) pick(event.dataTransfer.files[0] ?? null);
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            className="sr-only"
            disabled={busy}
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <FileText className="size-5 text-evidence" aria-hidden />
              <span className="font-ui text-sm font-medium break-all">
                {file.name}
              </span>
              <span className="text-xs text-ink-faint">
                {formatBytes(file.size)}
                {isImage
                  ? ` · ${fill(t.attach.convertedNote, { name: file.name })}`
                  : ""}
              </span>
            </>
          ) : (
            <>
              <Upload className="size-5 text-ink-faint" aria-hidden />
              <span className="font-ui text-sm font-medium">
                {t.attach.choose}
              </span>
              <span className="text-xs text-ink-faint">
                {fill(t.attach.dropHint, { max: maxMb })}
              </span>
            </>
          )}
        </label>

        {target.kind === "block" && (
          <div className="mt-4 flex flex-col gap-1.5">
            <label
              htmlFor="attachment-description"
              className="text-xs font-medium text-ink-soft"
            >
              {t.attach.description}
            </label>
            <input
              id="attachment-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t.attach.descriptionPlaceholder}
              maxLength={300}
              disabled={busy}
              className="h-9 w-full border-0 border-b border-line bg-transparent text-sm outline-none placeholder:text-ink-faint focus:border-b-2 focus:border-ink"
            />
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.attach.cancel}
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            disabled={!file || busy}
            aria-busy={busy}
          >
            {phase === "uploading"
              ? t.attach.uploading
              : phase === "processing"
                ? isImage
                  ? t.attach.converting
                  : t.attach.uploading
                : t.attach.upload}
          </Button>
        </div>
      </div>
    </div>
  );
}

async function toError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return new Error(body.error ?? "Upload failed");
}
