"use client";

import { FileText, RefreshCw, Trash2, Unlink } from "lucide-react";
import { formatBytes } from "@/lib/attachments/file-types";
import { useLocale } from "@/lib/i18n/client";
import type { AttachmentDto } from "@/lib/reports/service";

/**
 * The evidence rail: a quiet column beside the document listing every file
 * attached to the report.
 *
 * It is the counterpart to the inline chips — the chips say *where* a document is
 * cited, this says *what* the report is built on. It also surfaces evidence whose
 * anchor text was deleted, so nothing is ever silently orphaned.
 */
export function EvidenceRail({
  attachments,
  knownBlockIds,
  onOpen,
  onRemove,
  onReplace,
}: {
  attachments: AttachmentDto[];
  knownBlockIds: Set<string>;
  onOpen: (attachmentId: string) => void;
  onRemove: (attachmentId: string) => void;
  onReplace: (attachmentId: string) => void;
}) {
  const { t } = useLocale();

  return (
    <div className="lg:sticky lg:top-28">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
        <h2 className="font-ui text-[0.6875rem] font-semibold tracking-[0.08em] text-ink-faint uppercase">
          {t.attach.listTitle}
        </h2>
        {attachments.length > 0 && (
          <span className="font-ui text-[0.6875rem] tabular-nums text-ink-faint">
            {attachments.length}
          </span>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="font-ui rounded border border-dashed border-line-strong px-3 py-6 text-center text-[0.6875rem] leading-relaxed text-ink-faint">
          {t.attach.listEmpty}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {attachments.map((attachment) => {
            const linked = attachment.blockIds.some((blockId) =>
              knownBlockIds.has(blockId),
            );
            return (
              <li
                key={attachment.id}
                className="group rounded border border-line bg-paper transition-colors hover:border-line-strong"
              >
                <button
                  type="button"
                  onClick={() => onOpen(attachment.id)}
                  title={`${t.attach.open}: ${attachment.fileName}`}
                  className="flex w-full items-start gap-2 px-2.5 pt-2.5 pb-1.5 text-start"
                >
                  <FileText
                    className="mt-px size-3.5 shrink-0 text-evidence"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className="font-ui block truncate text-[0.75rem] font-medium text-ink"
                      dir="auto"
                    >
                      {attachment.fileName}
                    </span>
                    <span className="font-ui mt-0.5 block text-[0.625rem] text-ink-faint">
                      {formatBytes(attachment.size)} ·{" "}
                      {t.attach.pages(attachment.pageCount)}
                    </span>
                  </span>
                </button>

                {attachment.description && (
                  <p
                    className="font-ui px-2.5 pb-1 text-[0.625rem] leading-snug text-ink-soft"
                    dir="auto"
                  >
                    {attachment.description}
                  </p>
                )}

                <div className="flex items-center gap-1 border-t border-line/70 px-1.5 py-1">
                  {!linked && (
                    <span
                      className="font-ui inline-flex items-center gap-1 rounded-full px-1 text-[0.5625rem] text-ink-faint"
                      title={t.attach.unlinked}
                    >
                      <Unlink className="size-2.5" aria-hidden />
                      {t.attach.unlinked}
                    </span>
                  )}
                  {/* Touch devices never hover, so the actions stay visible there. */}
                  <div className="ms-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                    <RailAction
                      label={t.attach.replace}
                      onClick={() => onReplace(attachment.id)}
                    >
                      <RefreshCw className="size-3" aria-hidden />
                    </RailAction>
                    <RailAction
                      label={t.attach.remove}
                      danger
                      onClick={() => onRemove(attachment.id)}
                    >
                      <Trash2 className="size-3" aria-hidden />
                    </RailAction>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RailAction({
  label,
  onClick,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid size-6 place-items-center rounded transition-colors ${
        danger
          ? "text-ink-faint hover:bg-danger/10 hover:text-danger"
          : "text-ink-faint hover:bg-surface-high hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
