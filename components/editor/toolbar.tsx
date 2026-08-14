"use client";

import type { Editor } from "@tiptap/react";
import { useCallback } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { useLocale } from "@/lib/i18n/client";

function ToolButton({
  onClick,
  active = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded transition-colors focus-ring disabled:opacity-35 ${
        active
          ? "bg-ink text-white"
          : "text-ink-soft hover:bg-surface-high hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />;
}

/**
 * Document toolbar. Deliberately flat and quiet — the writing surface is the
 * focus, and every control maps to something the exported PDF can render.
 */
export function Toolbar({ editor }: { editor: Editor }) {
  const { t } = useLocale();

  const setLink = useCallback(() => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const input = window.prompt(t.toolbar.linkPrompt, previous ?? "https://");
    if (input === null) return;
    const href = input.trim();
    if (href === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
      window.alert("Links must start with http://, https://, mailto: or tel:");
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href, target: "_blank" })
      .run();
  }, [editor, t.toolbar.linkPrompt]);

  const inTable = editor.isActive("table");

  return (
    <div
      className="sticky top-14 z-20 -mx-4 flex flex-wrap items-center gap-0.5 border-b border-line bg-desk/95 px-4 py-1.5 backdrop-blur sm:mx-0 sm:rounded sm:border sm:px-2"
      role="toolbar"
      aria-label="Formatting"
      dir="ltr"
    >
      <ToolButton
        title={t.toolbar.undo}
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo2 className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.redo}
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo2 className="size-4" />
      </ToolButton>

      <Divider />

      <ToolButton
        title={t.toolbar.paragraph}
        active={editor.isActive("paragraph") && !editor.isActive("heading")}
        onClick={() => editor.chain().focus().setParagraph().run()}
      >
        <Pilcrow className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.heading1}
        active={editor.isActive("heading", { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      >
        <Heading1 className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.heading2}
        active={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <Heading2 className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.heading3}
        active={editor.isActive("heading", { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      >
        <Heading3 className="size-4" />
      </ToolButton>

      <Divider />

      <ToolButton
        title={t.toolbar.bold}
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.italic}
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.underline}
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.strike}
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.link}
        active={editor.isActive("link")}
        onClick={setLink}
      >
        <LinkIcon className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.clearFormatting}
        onClick={() =>
          editor.chain().focus().unsetAllMarks().clearNodes().run()
        }
      >
        <RemoveFormatting className="size-4" />
      </ToolButton>

      <Divider />

      <ToolButton
        title={t.toolbar.bulletList}
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.orderedList}
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.blockquote}
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="size-4" />
      </ToolButton>

      <Divider />

      <ToolButton
        title={t.toolbar.alignLeft}
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.alignCenter}
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.alignRight}
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight className="size-4" />
      </ToolButton>
      <ToolButton
        title={t.toolbar.alignJustify}
        active={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
      >
        <AlignJustify className="size-4" />
      </ToolButton>

      <Divider />

      <ToolButton
        title={t.toolbar.rtl}
        active={editor.isActive({ dir: "rtl" })}
        onClick={() => editor.chain().focus().setBlockDirection("rtl").run()}
      >
        <span className="font-ui text-[0.6875rem] font-semibold">RTL</span>
      </ToolButton>
      <ToolButton
        title={t.toolbar.ltr}
        active={editor.isActive({ dir: "ltr" })}
        onClick={() => editor.chain().focus().setBlockDirection("ltr").run()}
      >
        <span className="font-ui text-[0.6875rem] font-semibold">LTR</span>
      </ToolButton>

      <Divider />

      <ToolButton
        title={inTable ? t.toolbar.addRow : t.toolbar.table}
        active={inTable}
        onClick={() =>
          inTable
            ? editor.chain().focus().addRowAfter().run()
            : editor
                .chain()
                .focus()
                .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                .run()
        }
      >
        <TableIcon className="size-4" />
      </ToolButton>

      {inTable && (
        <>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().addColumnAfter().run()}
            className="font-ui h-8 rounded px-2 text-xs text-ink-soft hover:bg-surface-high"
          >
            {t.toolbar.addColumn}
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().deleteRow().run()}
            className="font-ui h-8 rounded px-2 text-xs text-ink-soft hover:bg-surface-high"
          >
            {t.toolbar.deleteRow}
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().deleteColumn().run()}
            className="font-ui h-8 rounded px-2 text-xs text-ink-soft hover:bg-surface-high"
          >
            {t.toolbar.deleteColumn}
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor.chain().focus().deleteTable().run()}
            className="font-ui h-8 rounded px-2 text-xs text-danger hover:bg-danger/10"
          >
            {t.toolbar.deleteTable}
          </button>
        </>
      )}
    </div>
  );
}
