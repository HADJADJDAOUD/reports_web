import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/**
 * Highlights the block that an attachment is about to be linked to, so it is
 * always obvious which piece of content the evidence will belong to.
 */

export interface AttachTarget {
  blockId: string;
  /** Document position of the target block. */
  pos: number;
  nodeSize: number;
}

export const attachTargetKey = new PluginKey<AttachTarget | null>(
  "attachTarget",
);

export const AttachTargetHighlight = Extension.create({
  name: "attachTargetHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<AttachTarget | null>({
        key: attachTargetKey,
        state: {
          init: () => null,
          apply: (transaction, previous) => {
            const meta = transaction.getMeta(attachTargetKey);
            if (meta !== undefined) return meta as AttachTarget | null;
            if (!transaction.docChanged || !previous) return previous;
            // Keep the highlight anchored while the user edits.
            const mapped = transaction.mapping.mapResult(previous.pos);
            if (mapped.deleted) return null;
            return { ...previous, pos: mapped.pos };
          },
        },
        props: {
          decorations: (state) => {
            const target = attachTargetKey.getState(state);
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
