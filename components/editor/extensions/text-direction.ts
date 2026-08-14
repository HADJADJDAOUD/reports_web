import { Extension } from "@tiptap/core";

/**
 * Per-block writing direction.
 *
 * A report can mix an Arabic (RTL) section with an English (LTR) one, so the
 * direction lives on the block rather than on the document. Blocks without an
 * explicit value inherit the document direction.
 */

export type BlockDirection = "rtl" | "ltr";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textDirection: {
      setBlockDirection: (direction: BlockDirection) => ReturnType;
      unsetBlockDirection: () => ReturnType;
    };
  }
}

export interface TextDirectionOptions {
  types: string[];
}

export const TextDirection = Extension.create<TextDirectionOptions>({
  name: "textDirection",

  addOptions() {
    return {
      types: ["paragraph", "heading", "blockquote", "listItem"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          dir: {
            default: null,
            keepOnSplit: true,
            parseHTML: (element) => {
              const value = element.getAttribute("dir");
              return value === "rtl" || value === "ltr" ? value : null;
            },
            renderHTML: (attributes) =>
              attributes.dir ? { dir: attributes.dir as string } : {},
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setBlockDirection:
        (direction) =>
        ({ commands, editor }) =>
          this.options.types
            .filter((type) => editor.state.schema.nodes[type])
            .map((type) => commands.updateAttributes(type, { dir: direction }))
            .some(Boolean),
      unsetBlockDirection:
        () =>
        ({ commands, editor }) =>
          this.options.types
            .filter((type) => editor.state.schema.nodes[type])
            .map((type) => commands.resetAttributes(type, "dir"))
            .some(Boolean),
    };
  },
});
