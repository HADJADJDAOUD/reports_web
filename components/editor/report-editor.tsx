"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TableKit } from "@tiptap/extension-table";
import { Placeholder } from "@tiptap/extensions";
import { Paperclip } from "lucide-react";
import { Toolbar } from "./toolbar";
import { AttachDialog } from "./attach-dialog";
import { AttachmentPreview } from "./attachment-preview";
import { EvidenceRail } from "./evidence-list";
import { SaveStateBadge, type SaveState } from "./save-state";
import { ExportButton } from "./export-button";
import { ShareButton } from "./share-button";
import { BlockId } from "./extensions/block-id";
import {
  AttachmentChips,
  setChipAttachments,
} from "./extensions/attachment-chips";
import {
  AttachTargetHighlight,
  selectionTarget,
} from "./extensions/attach-target";
import { TextDirection } from "./extensions/text-direction";
import { useLocale } from "@/lib/i18n/client";
import type { AttachmentDto, ReportDto } from "@/lib/reports/service";

const AUTOSAVE_DELAY_MS = 900;

/** The block the floating "Add Attachment" action is currently offering. */
interface AttachIntent {
  blockId: string;
  /** Document position the action is anchored to, so it survives scrolling. */
  anchor: number;
}

export function ReportEditor({
  report,
  initialAttachments,
  uploadMaxBytes,
}: {
  report: ReportDto;
  initialAttachments: AttachmentDto[];
  uploadMaxBytes: number;
}) {
  const { t } = useLocale();

  const [title, setTitle] = useState(report.title);
  const [subtitle, setSubtitle] = useState(report.subtitle);
  const [direction, setDirection] = useState(report.direction);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const [intent, setIntent] = useState<AttachIntent | null>(null);
  /** Bumped on scroll and resize to re-measure the floating action's position. */
  const [viewportTick, setViewportTick] = useState(0);
  const [dialogTarget, setDialogTarget] = useState<
    { kind: "block"; blockId: string } | { kind: "replace"; attachmentId: string } | null
  >(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSave = useRef(false);
  // Timers and keyboard shortcuts fire outside render, so the values they save
  // are read from here rather than from a stale closure.
  const latest = useRef({ title, subtitle, direction });
  useEffect(() => {
    latest.current = { title, subtitle, direction };
  }, [title, subtitle, direction]);

  const chipLabels = useMemo(
    () => ({ open: t.attach.open, remove: t.attach.remove }),
    [t.attach.open, t.attach.remove],
  );

  /** The document surface, used as the delegation root for chip clicks. */
  const documentRef = useRef<HTMLElement | null>(null);

  /* ----------------------------------------------------------------- editor */

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4] },
          link: {
            openOnClick: false,
            autolink: true,
            protocols: ["http", "https", "mailto", "tel"],
            HTMLAttributes: { rel: "noopener noreferrer nofollow" },
          },
          codeBlock: false,
        }),
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        TableKit.configure({ table: { resizable: true } }),
        Placeholder.configure({ placeholder: t.editor.bodyPlaceholder }),
        BlockId,
        TextDirection,
        AttachTargetHighlight,
        AttachmentChips.configure({ labels: chipLabels }),
      ],
      // Validated on the server against lib/doc/schema, hence the structural cast.
      content: report.content as unknown as JSONContent,
      editorProps: {
        attributes: { spellcheck: "true" },
      },
    },
    [],
  );

  /**
   * The attachment interaction is driven by the **text selection**, not by a
   * click.
   *
   * A double-click is only one of the ways a user selects a word, and on a phone
   * it is not one of them at all: Chrome on Android selects by long press and does
   * not reliably deliver `dblclick`. Reacting to the selection covers every
   * gesture on every device — double click, drag, long press — and it also means
   * the action disappears on its own the moment the selection goes away.
   */
  useEffect(() => {
    if (!editor) return;

    const sync = () => {
      const target = selectionTarget(editor.state);
      if (!target) {
        setIntent(null);
        return;
      }
      setIntent((current) =>
        current?.blockId === target.blockId && current.anchor === target.anchor
          ? current
          : { blockId: target.blockId, anchor: target.anchor },
      );
    };

    sync();
    editor.on("selectionUpdate", sync);
    editor.on("update", sync);
    editor.on("blur", sync);
    return () => {
      editor.off("selectionUpdate", sync);
      editor.off("update", sync);
      editor.off("blur", sync);
    };
  }, [editor]);

  /**
   * The floating action is positioned from the *document* position it belongs to,
   * re-measured whenever the page scrolls or resizes, so it stays glued to its
   * text instead of to wherever the pointer happened to be.
   */
  useEffect(() => {
    if (!intent) return;
    const remeasure = () => setViewportTick((tick) => tick + 1);
    window.addEventListener("scroll", remeasure, true);
    window.addEventListener("resize", remeasure);
    // On phones the on-screen keyboard resizes the visual viewport without
    // firing a window resize, which would leave the action stranded.
    window.visualViewport?.addEventListener("resize", remeasure);
    window.visualViewport?.addEventListener("scroll", remeasure);
    return () => {
      window.removeEventListener("scroll", remeasure, true);
      window.removeEventListener("resize", remeasure);
      window.visualViewport?.removeEventListener("resize", remeasure);
      window.visualViewport?.removeEventListener("scroll", remeasure);
    };
  }, [intent]);

  const intentAt = useMemo(() => {
    if (!editor || !intent) return null;
    try {
      const size = editor.state.doc.content.size;
      const box = editor.view.coordsAtPos(Math.min(intent.anchor, size));
      return { x: (box.left + box.right) / 2, y: box.bottom };
    } catch {
      return null;
    }
    // viewportTick is the scroll/resize signal; the measurement itself reads the
    // live DOM, which is exactly what has to be re-done when the page moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, intent, viewportTick]);

  const knownBlockIds = useKnownBlockIds(editor);

  /* ------------------------------------------------------------------- save */

  // A failed save retries itself once; the retry reaches the current `save`
  // through this ref instead of recursing into a stale closure.
  const saveRef = useRef<((options?: { immediate?: boolean }) => void) | null>(
    null,
  );

  const save = useCallback(
    async (options: { immediate?: boolean } = {}) => {
      if (!editor) return;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      pendingSave.current = false;
      setSaveState("saving");

      try {
        const response = await fetch(`/api/reports/${report.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: latest.current.title,
            subtitle: latest.current.subtitle,
            direction: latest.current.direction,
            content: editor.getJSON(),
          }),
        });
        if (!response.ok) throw new Error("save failed");
        setSaveState(pendingSave.current ? "dirty" : "saved");
      } catch {
        setSaveState("error");
        if (!options.immediate) {
          saveTimer.current = setTimeout(
            () => saveRef.current?.({ immediate: true }),
            4000,
          );
        }
      }
    },
    [editor, report.id],
  );

  useEffect(() => {
    saveRef.current = (options) => void save(options);
  }, [save]);

  const scheduleSave = useCallback(() => {
    pendingSave.current = true;
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
  }, [save]);

  useEffect(() => {
    if (!editor) return;
    editor.on("update", scheduleSave);
    return () => {
      editor.off("update", scheduleSave);
    };
  }, [editor, scheduleSave]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save({ immediate: true });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [save]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingSave.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  /* --------------------------------------------------------- chips + attach */

  // Push the current attachment list into the decoration plugin.
  useEffect(() => {
    if (!editor) return;
    setChipAttachments(editor.view, attachments);
  }, [editor, attachments]);

  const removeAttachment = useCallback(
    async (attachmentId: string) => {
      const found = attachments.find((item) => item.id === attachmentId);
      if (!found) return;
      if (!window.confirm(t.attach.removeConfirm)) return;
      setAttachments((current) =>
        current.filter((item) => item.id !== attachmentId),
      );
      const response = await fetch(
        `/api/reports/${report.id}/attachments/${attachmentId}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        // Put it back so the UI never lies about what is stored.
        setAttachments((current) =>
          [...current, found].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          ),
        );
      }
    },
    [attachments, report.id, t.attach.removeConfirm],
  );

  /**
   * Chips are rendered by a ProseMirror decoration, so their clicks are handled
   * once here by delegation rather than by wiring listeners into every widget.
   */
  useEffect(() => {
    const root = documentRef.current;
    if (!root) return;

    const onClick = (event: MouseEvent) => {
      const trigger = (event.target as HTMLElement | null)?.closest<HTMLElement>(
        "[data-chip-action]",
      );
      const attachmentId = trigger?.dataset.attachmentId;
      if (!trigger || !attachmentId) return;
      event.preventDefault();
      event.stopPropagation();
      if (trigger.dataset.chipAction === "remove") {
        void removeAttachment(attachmentId);
      } else {
        setPreviewId(attachmentId);
      }
    };

    // Keeps the editor selection from jumping when a chip is clicked.
    const onMouseDown = (event: MouseEvent) => {
      if ((event.target as HTMLElement | null)?.closest("[data-chip-action]")) {
        event.preventDefault();
      }
    };

    root.addEventListener("click", onClick);
    root.addEventListener("mousedown", onMouseDown);
    return () => {
      root.removeEventListener("click", onClick);
      root.removeEventListener("mousedown", onMouseDown);
    };
  }, [removeAttachment]);

  /**
   * Nothing needs to listen for "dismiss" events any more: the action exists
   * exactly as long as the selection does, and the selection effect above clears
   * it. That also removes the old race where the very gesture that opened the
   * action could immediately close it again.
   */
  const clearIntent = useCallback(() => setIntent(null), []);

  const previewAttachment = attachments.find((item) => item.id === previewId);

  /* ------------------------------------------------------------------- view */

  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SaveStateBadge state={saveState} onSave={() => void save({ immediate: true })} />
          <div className="flex items-center gap-2">
            <DirectionSwitch
              direction={direction}
              onChange={(next) => {
                setDirection(next);
                scheduleSave();
              }}
            />
            <ShareButton
              reportId={report.id}
              reportTitle={title}
              beforeShare={() => save({ immediate: true })}
            />
            <ExportButton
              reportId={report.id}
              beforeExport={() => save({ immediate: true })}
            />
          </div>
        </div>

        {editor && <Toolbar editor={editor} />}

        {/*
          The rail is pinned to the physical left in both interface languages
          (hence dir="ltr" here) while the document keeps its own direction.
          On narrow screens it drops below the document instead.
        */}
        <div
          className="mt-4 flex flex-col-reverse gap-5 lg:flex-row lg:items-start"
          dir="ltr"
        >
          <aside className="w-full shrink-0 lg:w-52">
            <EvidenceRail
              attachments={attachments}
              knownBlockIds={knownBlockIds}
              onOpen={(id) => setPreviewId(id)}
              onRemove={(id) => void removeAttachment(id)}
              onReplace={(id) =>
                setDialogTarget({ kind: "replace", attachmentId: id })
              }
            />
          </aside>

          <div className="min-w-0 flex-1">
        <article
          ref={documentRef}
          className="doc-surface rounded border border-line bg-paper px-6 py-10 shadow-[0_1px_2px_rgba(26,28,28,0.04)] sm:px-12 sm:py-14"
          dir={direction}
        >
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              scheduleSave();
            }}
            placeholder={t.editor.titlePlaceholder}
            maxLength={300}
            aria-label={t.editor.titlePlaceholder}
            className="w-full border-0 bg-transparent text-[1.75rem] font-bold leading-tight outline-none placeholder:text-ink-faint/60"
            style={{ fontFamily: "var(--font-doc)" }}
          />
          <input
            value={subtitle}
            onChange={(event) => {
              setSubtitle(event.target.value);
              scheduleSave();
            }}
            placeholder={t.editor.subtitlePlaceholder}
            maxLength={300}
            aria-label={t.editor.subtitlePlaceholder}
            className="font-ui mt-1 w-full border-0 bg-transparent text-sm text-ink-soft outline-none placeholder:text-ink-faint/60"
          />
          <hr className="my-6 border-line" />
          <EditorContent editor={editor} />
        </article>

            <p
              className="font-ui mt-3 flex items-center gap-1.5 text-xs text-ink-faint"
              dir="auto"
            >
              <Paperclip className="size-3.5 shrink-0" aria-hidden />
              {t.editor.attachHint}
            </p>
          </div>
        </div>
      </div>

      {intent && intentAt && !dialogTarget && !previewId && (
        <button
          type="button"
          data-attach-action
          /*
           * Opened on pointer-down, not click: on a phone the tap would otherwise
           * collapse the selection first, and the action would vanish before the
           * click ever arrived. Preventing the default also keeps the selection
           * visible while the dialog opens.
           */
          onPointerDown={(event) => {
            event.preventDefault();
            setDialogTarget({ kind: "block", blockId: intent.blockId });
          }}
          onClick={(event) => event.preventDefault()}
          style={{
            position: "fixed",
            left: `clamp(12px, ${intentAt.x}px - 5.5rem, 100vw - 12rem)`,
            top: intentAt.y + 12,
            touchAction: "manipulation",
          }}
          className="animate-fade-in font-ui z-40 inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-paper px-4 text-[0.8125rem] font-medium text-evidence shadow-[0_4px_14px_rgba(26,28,28,0.18)] hover:bg-evidence/5 sm:h-8 sm:rounded sm:px-2.5"
        >
          <Paperclip className="size-3.5 shrink-0" aria-hidden />
          {t.editor.addAttachment}
        </button>
      )}

      {dialogTarget && (
        <AttachDialog
          reportId={report.id}
          target={dialogTarget}
          maxBytes={uploadMaxBytes}
          onClose={() => {
            setDialogTarget(null);
            clearIntent();
          }}
          onDone={(attachment) => {
            setAttachments((current) => {
              const without = current.filter((item) => item.id !== attachment.id);
              return [...without, attachment].sort((a, b) =>
                a.createdAt.localeCompare(b.createdAt),
              );
            });
            setDialogTarget(null);
            clearIntent();
          }}
        />
      )}

      {previewAttachment && (
        <AttachmentPreview
          reportId={report.id}
          attachment={previewAttachment}
          onClose={() => setPreviewId(null)}
        />
      )}
    </>
  );
}

/** Block ids currently present in the document, for spotting orphaned evidence. */
function useKnownBlockIds(editor: Editor | null): Set<string> {
  const [ids, setIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!editor) return;
    const collect = () => {
      const next = new Set<string>();
      editor.state.doc.descendants((node) => {
        const blockId = node.attrs.blockId as string | undefined;
        if (blockId) next.add(blockId);
      });
      setIds(next);
    };
    collect();
    editor.on("update", collect);
    return () => {
      editor.off("update", collect);
    };
  }, [editor]);

  return ids;
}

function DirectionSwitch({
  direction,
  onChange,
}: {
  direction: "rtl" | "ltr";
  onChange: (direction: "rtl" | "ltr") => void;
}) {
  const { t } = useLocale();
  return (
    <div
      className="font-ui flex items-center rounded border border-line bg-paper p-0.5 text-[0.6875rem] font-semibold"
      title={t.editor.documentDirection}
      dir="ltr"
    >
      {(["ltr", "rtl"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={direction === value}
          className={`h-6 rounded px-2 transition-colors ${
            direction === value
              ? "bg-ink text-white"
              : "text-ink-soft hover:bg-surface-high"
          }`}
        >
          {value.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
