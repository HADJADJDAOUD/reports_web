"use client";

import { AlertCircle, Check, Loader2, PenLine } from "lucide-react";
import { useLocale } from "@/lib/i18n/client";

export type SaveState = "saved" | "saving" | "dirty" | "error";

/** Always-visible save indicator — the user should never wonder. */
export function SaveStateBadge({
  state,
  onSave,
}: {
  state: SaveState;
  onSave: () => void;
}) {
  const { t } = useLocale();

  const content: Record<SaveState, { icon: React.ReactNode; label: string; tone: string }> = {
    saved: {
      icon: <Check className="size-3.5" aria-hidden />,
      label: t.editor.saved,
      tone: "text-ink-faint",
    },
    saving: {
      icon: <Loader2 className="size-3.5 animate-spin" aria-hidden />,
      label: t.editor.saving,
      tone: "text-ink-faint",
    },
    dirty: {
      icon: <PenLine className="size-3.5" aria-hidden />,
      label: t.editor.unsaved,
      tone: "text-ink-soft",
    },
    error: {
      icon: <AlertCircle className="size-3.5" aria-hidden />,
      label: t.editor.saveFailed,
      tone: "text-danger",
    },
  };

  const current = content[state];

  return (
    <div className="font-ui flex items-center gap-2 text-xs">
      <span
        className={`inline-flex items-center gap-1.5 ${current.tone}`}
        role="status"
        aria-live="polite"
      >
        {current.icon}
        {current.label}
      </span>
      {(state === "dirty" || state === "error") && (
        <button
          type="button"
          onClick={onSave}
          className="rounded px-1.5 py-0.5 text-ink underline underline-offset-2 hover:bg-surface-high"
        >
          {t.editor.saveNow}
        </button>
      )}
    </div>
  );
}
