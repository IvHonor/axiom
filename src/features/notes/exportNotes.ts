// Every note as one Markdown file, grouped by folder, sticky notes last:
// yours to keep, readable in any editor. Written here because only this
// computer can read the notes.
import { loadDoc, toMarkdown } from "../../lib/richtext/doc";
import { today } from "../daily_plan/time";
import { api, nameOf, type Folder } from "./api";
import { pathOf } from "./parts";

/** Saves the notes to Downloads and returns where. */
export async function exportNotes(folders: Folder[]): Promise<string> {
  const cards = await api.list({ shelf: "all", sort: "title" });
  const groups = new Map<string, string[]>();
  for (const card of cards) {
    const { note, tags, edits } = await api.get(card.id);
    const doc = loadDoc(edits);
    const body = toMarkdown(doc) || note.text;
    doc.destroy();
    const group = note.sticky ? "Sticky notes" : pathOf(folders, note.folderId) || "Notes";
    const meta = [tags.length > 0 && tags.map((t) => `#${t}`).join(" "), note.sticky && `${note.color} sticky note`].filter(Boolean);
    const section = [`### ${nameOf(note) || "Untitled"}`, meta.length > 0 && `*${meta.join(" · ")}*`, body].filter(Boolean).join("\n\n");
    groups.set(group, [...(groups.get(group) ?? []), section]);
  }
  const order = [...groups.keys()].sort((a, b) => (a === "Sticky notes" ? 1 : b === "Sticky notes" ? -1 : a === "Notes" ? -1 : b === "Notes" ? 1 : a.localeCompare(b)));
  const [y, m, d] = today().split("-").map(Number);
  const date = new Date(y, m - 1, d, 12).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const markdown = `# Notes\n\nExported from Axiom on ${date}. ${cards.length} ${cards.length === 1 ? "note" : "notes"}.\n\n${order.map((g) => `## ${g}\n\n${groups.get(g)!.join("\n\n---\n\n")}`).join("\n\n")}\n`;
  return api.exportMarkdown(markdown);
}
