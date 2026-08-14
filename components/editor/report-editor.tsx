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
import { BlockId } from "./extensions/block-id";
import {
  AttachmentChips,
  setChipAttachments,
} from "./extensions/attachment-chips";
import { AttachTargetHighlight, attachTargetKey } from "./extensions/attach-target";
import { TextDirection } from "./extensions/text-direction";
import { useLocale } from "@/lib/i18n/client";
import type { AttachmentDto, ReportDto } from "@/lib/reports/service";

const AUTOSAVE_DELAY_MS = 900;

interface AttachIntent {
  blockId: string;
  x: number;
  y: number;
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
   * The attachment interaction starts here: double-click a piece of existing
   * text and we offer to attach evidence to that exact block.
   *
   * This listens for the browser's own `dblclick` on the editor element rather
   * than using ProseMirror's `handleDoubleClick`. ProseMirror resolves a double
   * click during the second *mousedown* and is still mid-gesture at that point,
   * so dispatching a transaction and setting React state from there fights with
   * its own selection handling. Reacting to the native event afterwards is both
   * simpler and reliable.
   */
  useEffect(() => {
    if (!editor) return;
    const view = editor.view;
    const dom = view.dom as HTMLElement;

    const onDoubleClick = (event: MouseEvent) => {
      const found = view.posAtCoords({
        left: event.clientX,
        top: event.clientY,
      });
      if (!found) return;

      const $pos = view.state.doc.resolve(
        Math.min(found.pos, view.state.doc.content.size),
      );
      let depth = $pos.depth;
      while (depth > 0 && !$pos.node(depth).isTextblock) depth -= 1;
      const node = depth > 0 ? $pos.node(depth) : null;
      const blockId = node?.attrs.blockId as string | undefined;

      // Evidence attaches to existing content, never to an empty line.
      if (!node || !blockId || node.content.size === 0) {
        setIntent(null);
        view.dispatch(view.state.tr.setMeta(attachTargetKey, null));
        return;
      }

      view.dispatch(
        view.state.tr.setMeta(attachTargetKey, {
          blockId,
          pos: $pos.before(depth),
          nodeSize: node.nodeSize,
        }),
      );
      setIntent({ blockId, x: event.clientX, y: event.clientY });
    };

    dom.addEventListener("dblclick", onDoubleClick);
    return () => dom.removeEventListener("dblclick", onDoubleClick);
  }, [editor]);

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

  const clearIntent = useCallback(() => {
    setIntent(null);
    if (editor) {
      editor.view.dispatch(editor.view.state.tr.setMeta(attachTargetKey, null));
    }
  }, [editor]);

  // Dismiss the floating action on any unrelated interaction.
  useEffect(() => {
    if (!intent) return;

    const dismiss = (event: Event) => {
      const element = event.target as HTMLElement | null;
      if (element?.closest("[data-attach-action]")) return;
      clearIntent();
    };
    const onScroll = () => clearIntent();

    // Registered on the next tick: the double-click that opened this action is
    // still being processed, and a triple-click sends a third mousedown right
    // behind it. Listening immediately would dismiss the button instantly.
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", dismiss);
      document.addEventListener("keydown", dismiss);
      window.addEventListener("scroll", onScroll, true);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", dismiss);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [intent, clearIntent]);

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

      {intent && (
        <button
          type="button"
          data-attach-action
          onClick={() => {
            setDialogTarget({ kind: "block", blockId: intent.blockId });
            setIntent(null);
          }}
          style={{
            position: "fixed",
            left: Math.min(Math.max(intent.x - 70, 12), window.innerWidth - 170),
            top: intent.y + 14,
          }}
          className="animate-fade-in font-ui z-40 inline-flex h-8 items-center gap-1.5 rounded border border-line bg-paper px-2.5 text-[0.8125rem] font-medium text-evidence shadow-[0_4px_14px_rgba(26,28,28,0.14)] hover:bg-evidence/5"
        >
          <Paperclip className="size-3.5" aria-hidden />
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
