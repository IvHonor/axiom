// Rich text as a Yjs document (a CRDT), for the Journal and Notes: edits
// made on different computers merge, so nothing anyone writes is lost. Saved
// as updates: each save stores only what's new since the last one. Mirrors
// src-tauri/src/features/doc_edits.rs.
import * as Y from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "@tiptap/y-tiptap";

export interface Edit {
  /** The rows it came from (several when it was split). */
  ids: string[];
  /** A Yjs update, base64. */
  data: string;
}

/** The fragment TipTap's Collaboration extension edits. */
export const FIELD = "default";
/** After this many saved updates, they're squashed into one snapshot. */
export const COMPACT_AFTER = 40;
/** Updates applied from storage are tagged, so they aren't saved again. */
export const REMOTE = "storage";

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A document with every edit applied. A broken update is skipped, not fatal. */
export function loadDoc(edits: Edit[], doc = new Y.Doc()): Y.Doc {
  for (const e of edits) {
    try {
      Y.applyUpdate(doc, fromBase64(e.data), REMOTE);
    } catch {
      console.warn("journal: skipped an update that couldn't be read");
    }
  }
  return doc;
}

/** Collects the edits made here (not ones read from storage) until they're saved. */
export class Saver {
  private pending: Uint8Array[] = [];
  private readonly doc: Y.Doc;
  private readonly listen = (update: Uint8Array, origin: unknown) => {
    if (origin !== REMOTE) this.pending.push(update);
  };

  constructor(doc: Y.Doc) {
    this.doc = doc;
    doc.on("update", this.listen);
  }

  get dirty(): boolean {
    return this.pending.length > 0;
  }

  /** The edits since the last save, as one update (base64), or null if none. */
  next(): string | null {
    if (!this.pending.length) return null;
    const update = Y.mergeUpdates(this.pending);
    this.pending = [];
    return toBase64(update);
  }

  /** Puts edits back after a save failed, to try again. */
  retry(update: string) {
    this.pending.unshift(fromBase64(update));
  }

  stop() {
    this.doc.off("update", this.listen);
  }
}

/** Everything as one update, to replace many small ones. */
export const snapshot = (doc: Y.Doc) => toBase64(Y.encodeStateAsUpdate(doc));

// ---------- Markdown ----------

interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

function inline(nodes: PmNode[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return "  \n";
      let text = n.text ?? "";
      for (const m of n.marks ?? []) {
        if (m.type === "bold") text = `**${text}**`;
        else if (m.type === "italic") text = `*${text}*`;
        else if (m.type === "strike") text = `~~${text}~~`;
        else if (m.type === "code") text = `\`${text}\``;
        else if (m.type === "link") text = `[${text}](${String(m.attrs?.href ?? "")})`;
      }
      return text;
    })
    .join("");
}

function block(node: PmNode, indent = ""): string {
  const children = node.content ?? [];
  switch (node.type) {
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${inline(children)}`;
    case "paragraph":
      return indent + inline(children);
    case "blockquote":
      return children.map((c) => block(c)).join("\n\n").split("\n").map((l) => `> ${l}`).join("\n");
    case "codeBlock":
      return "```\n" + inline(children) + "\n```";
    case "horizontalRule":
      return "---";
    case "bulletList":
      return children.map((item) => listItem(item, `${indent}- `, indent)).join("\n");
    case "orderedList":
      return children.map((item, i) => listItem(item, `${indent}${i + 1}. `, indent)).join("\n");
    case "taskList":
      return children.map((item) => listItem(item, `${indent}- [${item.attrs?.checked ? "x" : " "}] `, indent)).join("\n");
    default:
      return inline(children);
  }
}

function listItem(item: PmNode, marker: string, indent: string): string {
  const [first, ...rest] = item.content ?? [];
  const head = marker + (first ? inline(first.content) : "");
  const nested = rest.map((child) => block(child, `${indent}  `));
  return [head, ...nested].join("\n");
}

/** A document's text as Markdown. */
export function toMarkdown(doc: Y.Doc): string {
  const json = yXmlFragmentToProsemirrorJSON(doc.getXmlFragment(FIELD)) as PmNode;
  return (json.content ?? []).map((n) => block(n)).join("\n\n").trim();
}
