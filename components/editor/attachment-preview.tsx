"use client";

import { useEffect } from "react";
import { Download, X } from "lucide-react";
import { formatBytes } from "@/lib/attachments/file-types";
import { useLocale } from "@/lib/i18n/client";
import type { AttachmentDto } from "@/lib/reports/service";

/** In-app preview of an attachment, served through the ownership-checked route. */
export function AttachmentPreview({
  reportId,
  attachment,
  onClose,
}: {
  reportId: string;
  attachment: AttachmentDto;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const src = `/api/reports/${reportId}/attachments/${attachment.id}/file`;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-ink/40 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-line bg-paper">
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="font-ui truncate text-sm font-medium" dir="auto">
              {attachment.fileName}
            </p>
            <p className="text-xs text-ink-faint">
              {formatBytes(attachment.size)} ·{" "}
              {t.attach.pages(attachment.pageCount)}
              {attachment.convertedFromImage
                ? ` · ${attachment.originalFileName}`
                : ""}
            </p>
          </div>
          <a
            href={`${src}?download=1`}
            className="font-ui inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-[0.8125rem] text-ink-soft hover:bg-surface-high hover:text-ink"
          >
            <Download className="size-4" aria-hidden />
            {t.export.download}
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.attach.close}
            className="grid size-8 place-items-center rounded text-ink-faint hover:bg-surface-high hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <iframe
          src={src}
          title={attachment.fileName}
          className="min-h-0 flex-1 bg-surface"
        />
      </div>
    </div>
  );
}
