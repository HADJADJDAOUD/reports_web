import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { EditorView } from "@tiptap/pm/view";
import type { EditorState } from "@tiptap/pm/state";
import type { AttachmentDto } from "@/lib/reports/service";
import { formatBytes, shortFileName } from "@/lib/attachments/file-types";

/**
 * Renders evidence as compact inline file chips at the end of the block they are
 * attached to.
 *
 * The chips are ProseMirror *widget decorations*: they are painted into the
 * document but are not part of the editable text, so a chip can never be typed
 * over, split, or left floating in empty space. Which chip appears where is
 * derived purely from `blockId`, which is why rewriting the surrounding sentence
 * never breaks the link.
 */

/**
 * Chips are plain DOM with `data-chip-action` markers; the editor component
 * listens for clicks once, higher up. Keeping callbacks out of the extension
 * means the plugin never has to be rebuilt when React re-renders.
 */
export interface ChipLabels {
  open: string;
  remove: string;
}

export interface AttachmentChipsOptions {
  labels: ChipLabels;
}

interface ChipsState {
  attachments: AttachmentDto[];
  decorations: DecorationSet;
}

export const attachmentChipsKey = new PluginKey<ChipsState>("attachmentChips");

/** Dispatch this on the editor view to refresh chips after uploads/removals. */
export function setChipAttachments(
  view: EditorView,
  attachments: AttachmentDto[],
): void {
  view.dispatch(
    view.state.tr
      .setMeta(attachmentChipsKey, attachments)
      .setMeta("addToHistory", false),
  );
}

const PDF_ICON_SVG = `<svg class="chip-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 1.75H4.5a1.25 1.25 0 0 0-1.25 1.25v10a1.25 1.25 0 0 0 1.25 1.25h7a1.25 1.25 0 0 0 1.25-1.25V5z"/><path d="M9.25 1.9V5.25h3.35"/><path d="M5.75 8.75h4.5M5.75 11h3"/></svg>`;

function buildChip(
  attachment: AttachmentDto,
  labels: ChipLabels,
): HTMLElement {
  const chip = document.createElement("span");
  chip.className = "chip";
  chip.dataset.attachmentId = attachment.id;
  chip.setAttribute("dir", "auto");

  const open = document.createElement("button");
  open.type = "button";
  open.className = "chip-open";
  open.dataset.chipAction = "open";
  open.dataset.attachmentId = attachment.id;
  // The clipped name keeps the chip small; the full one lives in the tooltip.
  open.title = `${labels.open}: ${attachment.fileName} · ${formatBytes(attachment.size)}`;
  open.innerHTML = PDF_ICON_SVG;

  const name = document.createElement("span");
  name.className = "chip-name";
  name.textContent = shortFileName(attachment.fileName);
  open.appendChild(name);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "chip-remove";
  remove.dataset.chipAction = "remove";
  remove.dataset.attachmentId = attachment.id;
  remove.title = labels.remove;
  remove.setAttribute("aria-label", `${labels.remove}: ${attachment.fileName}`);
  remove.innerHTML = `<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>`;

  chip.append(open, remove);
  return chip;
}

function buildDecorations(
  state: EditorState,
  attachments: AttachmentDto[],
  labels: ChipLabels,
): DecorationSet {
  if (attachments.length === 0) return DecorationSet.empty;

  const byBlock = new Map<string, AttachmentDto[]>();
  for (const attachment of attachments) {
    for (const blockId of attachment.blockIds) {
      const list = byBlock.get(blockId);
      if (list) list.push(attachment);
      else byBlock.set(blockId, [attachment]);
    }
  }

  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const blockId = node.attrs.blockId as string | undefined;
    if (!blockId) return;
    const list = byBlock.get(blockId);
    if (!list || list.length === 0) return;

    // End of the block's inline content: the chip trails the text and wraps with it.
    const endOfContent = pos + node.nodeSize - 1;
    const key = `chips:${blockId}:${list.map((item) => `${item.id}@${item.size}`).join(",")}`;

    decorations.push(
      Decoration.widget(
        endOfContent,
        () => {
          const row = document.createElement("span");
          row.className = "chip-row";
          row.contentEditable = "false";
          row.setAttribute("dir", "auto");
          for (const attachment of list) {
            row.appendChild(buildChip(attachment, labels));
          }
          return row;
        },
        { side: 1, key, ignoreSelection: true, stopEvent: () => true },
      ),
    );
  });

  return DecorationSet.create(state.doc, decorations);
}

export const AttachmentChips = Extension.create<AttachmentChipsOptions>({
  name: "attachmentChips",

  addOptions() {
    return {
      labels: { open: "Open", remove: "Remove" },
    };
  },

  addProseMirrorPlugins() {
    const labels = this.options.labels;

    return [
      new Plugin<ChipsState>({
        key: attachmentChipsKey,
        state: {
          init: (_config, state) => ({
            attachments: [],
            decorations: buildDecorations(state, [], labels),
          }),
          apply: (transaction, previous, _oldState, newState) => {
            const incoming = transaction.getMeta(attachmentChipsKey) as
              | AttachmentDto[]
              | undefined;

            if (incoming) {
              return {
                attachments: incoming,
                decorations: buildDecorations(newState, incoming, labels),
              };
            }
            if (!transaction.docChanged) return previous;
            return {
              attachments: previous.attachments,
              decorations: buildDecorations(
                newState,
                previous.attachments,
                labels,
              ),
            };
          },
        },
        props: {
          decorations: (state) => attachmentChipsKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
