// [[Links]] between notes, written as plain text so they survive anywhere
// the text goes (Markdown export included): highlighted, opened with
// Ctrl+click, and suggested as you type after "[[".
import { Extension } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { shortcut } from "../shortcut";

/** What's typed after an open "[[", and where. */
export interface LinkQuery {
  /** Just after the "[[". */
  from: number;
  /** The cursor. */
  to: number;
  text: string;
}

export interface WikiLinkOptions {
  open: (title: string) => void;
  /** Called as the cursor moves: a query after "[[", or null. */
  query: (query: LinkQuery | null) => void;
  /** Keys while suggestions show; true if used. */
  key: (event: KeyboardEvent) => boolean;
}

const LINK = /\[\[([^[\]\n]+)\]\]/g;
const OPEN = /\[\[([^[\]\n]*)$/;
// Stands in for non-text inline nodes, which take one position each.
const LEAF = "￼";

function decorate(doc: PmNode): DecorationSet {
  const found: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = "";
    node.forEach((child) => {
      text += child.isText ? child.text : LEAF;
    });
    for (const m of text.matchAll(LINK)) {
      const start = pos + 1 + (m.index ?? 0);
      found.push(Decoration.inline(start, start + m[0].length, { class: "rx-link", "data-title": m[1].trim(), title: shortcut("Ctrl+click to open") }));
    }
    return false;
  });
  return DecorationSet.create(doc, found);
}

const KEY = new PluginKey<DecorationSet>("wikiLinks");

export const WikiLinks = Extension.create<WikiLinkOptions>({
  name: "wikiLinks",

  addOptions() {
    return { open: () => {}, query: () => {}, key: () => false };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<DecorationSet>({
        key: KEY,
        state: {
          init: (_, state) => decorate(state.doc),
          apply: (tr, old) => (tr.docChanged ? decorate(tr.doc) : old),
        },
        props: {
          decorations: (state) => KEY.getState(state),
          handleKeyDown: (_, event) => options.key(event),
          handleClick: (_, __, event) => {
            if (!(event.ctrlKey || event.metaKey)) return false;
            const link = (event.target as HTMLElement | null)?.closest<HTMLElement>(".rx-link");
            if (!link?.dataset.title) return false;
            options.open(link.dataset.title);
            return true;
          },
        },
        view: () => ({
          update: (view) => {
            const { selection } = view.state;
            const $from = selection.$from;
            if (!selection.empty || !$from.parent.isTextblock) return options.query(null);
            const before = $from.parent.textBetween(0, $from.parentOffset, undefined, LEAF);
            const m = OPEN.exec(before);
            options.query(m ? { from: selection.from - m[1].length, to: selection.from, text: m[1] } : null);
          },
        }),
      }),
    ];
  },
});

/** The titles a note links to, in order, without repeats (in any case). */
export function linksIn(text: string): string[] {
  const seen = new Map<string, string>();
  for (const m of text.matchAll(LINK)) {
    const title = m[1].trim();
    if (!seen.has(title.toLowerCase())) seen.set(title.toLowerCase(), title);
  }
  return [...seen.values()];
}
