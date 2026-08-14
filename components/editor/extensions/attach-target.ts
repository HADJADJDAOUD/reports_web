import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Highlights the block that evidence would be attached to, so it is always
 * obvious which piece of content the attachment will belong to.
 *
 * The target is derived from the current selection rather than tracked in plugin
 * state. That keeps it correct for every way a user can select text — double
 * click, drag, or a long press on a phone — and means nothing has to be
 * dispatched or cleaned up when the selection moves.
 */

export interface AttachTarget {
  blockId: string;
  /** Document position of the block that owns the selection. */
  pos: number;
  /** Position the floating action should be anchored to. */
  anchor: number;
}

export const attachTargetKey = new PluginKey("attachTargetHighlight");

/**
 * The block a non-empty selection sits in, or null when there is nothing to
 * attach to — an empty selection, or a block with no text and no id.
 */
export function selectionTarget(state: EditorState): AttachTarget | null {
  const { selection } = state;
  if (selection.empty) return null;

  const $from = selection.$from;
  let depth = $from.depth;
  while (depth > 0 && !$from.node(depth).isTextblock) depth -= 1;
  if (depth === 0) return null;

  const node = $from.node(depth);
  const blockId = node.attrs.blockId as string | undefined;
  if (!blockId || node.content.size === 0) return null;

  return {
    blockId,
    pos: $from.before(depth),
    anchor: Math.min(selection.to, $from.after(depth) - 1),
  };
}

export const AttachTargetHighlight = Extension.create({
  name: "attachTargetHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: attachTargetKey,
        props: {
          decorations: (state) => {
            const target = selectionTarget(state);
            if (!target) return null;
            const node = state.doc.nodeAt(target.pos);
            if (!node) return null;
            return DecorationSet.create(state.doc, [
              Decoration.node(target.pos, target.pos + node.nodeSize, {
                class: "attach-target",
              }),
            ]);
          },
        },
      }),
    ];
  },
});
