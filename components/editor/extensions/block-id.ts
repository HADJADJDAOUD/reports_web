import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { customAlphabet } from "nanoid";

/**
 * Gives every block-level node a stable `blockId`.
 *
 * Attachments are linked to these ids, never to text content, so evidence keeps
 * pointing at the right paragraph while the user rewrites it. Ids are assigned
 * once and then preserved; a split paragraph gets a fresh id for the new half so
 * two blocks can never share one identity.
 */

const nanoid = customAlphabet(
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
  10,
);

export function createBlockId(): string {
  return nanoid();
}

export const BLOCK_ID_ATTRIBUTE = "data-block-id";

export const blockIdPluginKey = new PluginKey("blockId");

export interface BlockIdOptions {
  /** Node type names that should carry an id. */
  types: string[];
}

export const BlockId = Extension.create<BlockIdOptions>({
  name: "blockId",

  addOptions() {
    return {
      types: [
        "paragraph",
        "heading",
        "blockquote",
        "listItem",
        "tableCell",
        "tableHeader",
      ],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          blockId: {
            default: null,
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute(BLOCK_ID_ATTRIBUTE),
            renderHTML: (attributes) =>
              attributes.blockId
                ? { [BLOCK_ID_ATTRIBUTE]: attributes.blockId as string }
                : {},
          },
        },
      },
    ];
  },

  /**
   * A document loaded from storage has no ids on blocks that were never edited,
   * and `appendTransaction` only runs once something changes. Assigning on load
   * means every block is attachable — and saveable — from the very first render.
   */
  onCreate() {
    const { editor } = this;
    const transaction = assignMissingIds(
      editor.state,
      new Set(this.options.types),
    );
    if (transaction) editor.view.dispatch(transaction);
  },

  addProseMirrorPlugins() {
    const types = new Set(this.options.types);

    return [
      new Plugin({
        key: blockIdPluginKey,
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null;
          }
          return assignMissingIds(newState, types);
        },
      }),
    ];
  },
});

/**
 * Gives an id to every block that lacks one, and re-keys duplicates so a split
 * or pasted block never shares an identity — and therefore never inherits
 * another block's attachments.
 */
function assignMissingIds(
  state: EditorState,
  types: Set<string>,
): Transaction | null {
  const seen = new Set<string>();
  const missing: { pos: number; node: ProseMirrorNode }[] = [];

  state.doc.descendants((node, pos) => {
    if (!types.has(node.type.name)) return;
    const id = node.attrs.blockId as string | null;
    if (!id || seen.has(id)) missing.push({ pos, node });
    else seen.add(id);
  });

  if (missing.length === 0) return null;

  const transaction = state.tr;
  for (const { pos, node } of missing) {
    const id = createBlockId();
    seen.add(id);
    transaction.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: id });
  }
  return transaction.setMeta("addToHistory", false);
}
