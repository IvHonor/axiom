// The whole journal as one Markdown file, oldest first: yours to keep,
// readable in any editor. Written here because only this computer can read
// the entries.
import { today } from "../daily_plan/time";
import { ENERGY, api, moodOf } from "./api";
import { loadDoc, toMarkdown } from "../../lib/richtext/doc";

function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Saves the journal to Downloads and returns where. */
export async function exportJournal(): Promise<string> {
  const cards = await api.list({});
  const sections: string[] = [];
  for (const card of [...cards].reverse()) {
    const { entry, tags, edits } = await api.get(card.id);
    const doc = loadDoc(edits);
    const body = toMarkdown(doc) || entry.text;
    doc.destroy();
    const meta = [
      moodOf(entry.mood) && `Mood: ${moodOf(entry.mood)!.emoji} ${moodOf(entry.mood)!.label}`,
      entry.energy && `Energy: ${ENERGY.find((e) => e.value === entry.energy)?.label}`,
      tags.length > 0 && tags.map((t) => `#${t}`).join(" "),
    ].filter(Boolean);
    sections.push(
      [
        `## ${longDate(entry.day)}${entry.title.trim() ? ` · ${entry.title.trim()}` : ""}`,
        meta.length > 0 && `*${meta.join(" · ")}*`,
        entry.prompt && `> ${entry.prompt}`,
        body,
      ]
        .filter(Boolean)
        .join("\n\n"),
    );
  }
  const markdown = `# Journal\n\nExported from Axiom on ${longDate(today())}. ${cards.length} ${cards.length === 1 ? "entry" : "entries"}.\n\n${sections.join("\n\n---\n\n")}\n`;
  return api.exportMarkdown(markdown);
}
