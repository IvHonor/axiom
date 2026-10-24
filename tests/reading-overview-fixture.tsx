// Real overview, menu, resizing and navigation state; every backend command is an in-memory fixture.
import { useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { api, type BookCard, type ReadingSummary as Summary, type ReadingStats } from "../src/features/reading/api";
import { ReadingSummary } from "../src/features/reading/ReadingSummary";
import { ReadingSummaryTitle } from "../src/features/reading/overview/ReadingOverviewMenu";
import { readingChanged, useReadingUi } from "../src/features/reading/readingUi";
import { ResizableTile, TileGrid } from "../src/shell/ui/ResizableTile";
import { Panel } from "../src/shell/ui/Panel";
import { applyTheme } from "../src/shell/theme/applyTheme";
import { modernThemes } from "../src/themes/modern_themes";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/features/reading/reading.css";

const query = new URLSearchParams(location.search);
applyTheme(modernThemes.themes![query.get("theme") === "light" ? 1 : 0]);
let fail = query.has("fail"), partial = query.has("partial"), statsFail = query.has("statsFail");
let delayNext = 0;
const calls = { summary: 0, list: 0, stats: 0, covers: 0 };
const titles = ["The Left Hand of Darkness", "A very long book title about the quiet art of paying attention to everything around us", "Invisible Cities", "The Dispossessed", "A Field Guide to Getting Lost", "Braiding Sweetgrass", "A Wizard of Earthsea", "The Book of Disquiet"];
let books: BookCard[] = Array.from({length: query.has("empty") ? 0 : query.has("one") ? 1 : 38}, (_, i) => {
  const status = i < 14 ? "reading" : i < 26 ? "want" : i < 36 ? "finished" : "dnf";
  return {
    id: `b${i}`, title: query.has("unbroken") ? "AnExtraordinarilyLongUnbrokenTitle".repeat(5) : titles[i % titles.length] + (i >= titles.length ? ` · ${i + 1}` : ""),
    authors: i % 5 === 0 ? "" : i % 3 === 0 ? "An author with a very long name and another equally long collaborator" : "Ursula K. Le Guin",
    coverUrl: i % 4 === 0 ? null : `fixture-cover-${i % 7}`, workKey: null, editionKey: null, isbn: null,
    publishedYear: 1974, apiPages: 320, pages: null, format: i % 3 === 0 ? "audio" : i % 3 === 1 ? "ebook" : "print",
    unit: i % 3 === 0 ? "minutes" : i % 3 === 1 ? "percent" : "pages", audioMinutes: i % 3 === 0 ? 620 : null,
    status, progress: i % 3 === 0 ? 200 : i % 3 === 1 ? 40 : 140, rating: status === "finished" ? (i % 10) + 1 : null,
    review: "", startedOn: "2026-10-01", finishedOn: status === "finished" ? `2026-10-${String(i - 10).padStart(2,"0")}` : null,
    position: i, createdAt: "2026-10-01T12:00:00Z", updatedAt: "2026-10-23T12:00:00Z",
    total: i % 5 === 0 ? null : i % 3 === 0 ? 620 : i % 3 === 1 ? 100 : 320,
    percent: i % 5 === 0 ? null : (i * 7) % 100, finishEstimate: i % 2 ? "2026-11-05" : null,
    lastRead: i < 14 ? `2026-10-${String(23 - i).padStart(2, "0")}` : null, notes: i % 5,
  };
});
if (query.has("noReading")) books = books.filter(book => book.status !== "reading");
const goal = {year: 2026, books: query.has("noGoal") ? null : 24, finished: query.has("exceeded") ? 30 : query.has("empty") ? 0 : 12, expected: 19};
const summary = (): Summary => ({ reading: books.filter(book => book.status === "reading"), goal,
  streak: query.has("empty") ? 0 : 7, pagesToday: query.has("empty") ? 0 : 34,
  shelves: { reading: books.filter(b => b.status === "reading").length, want: books.filter(b => b.status === "want").length, finished: books.filter(b => b.status === "finished").length, dnf: books.filter(b => b.status === "dnf").length } });
api.summary = async () => {
  calls.summary++; if (fail) throw new Error("Fixture summary unavailable");
  const captured = structuredClone(summary()), delay = delayNext; delayNext = 0;
  if (delay) await new Promise(resolve => setTimeout(resolve, delay));
  return captured;
};
api.list = async () => { calls.list++; if (partial) throw new Error("Fixture shelves unavailable"); return structuredClone(books); };
api.stats = async () => {
  calls.stats++; if (statsFail) throw new Error("Fixture statistics unavailable");
  return { goal, pages: 4832, listenedMinutes: 630, readingMinutes: 820, months: Array.from({length: 12}, (_, i) => ({month: i+1, books: i % 4, pages: i * 110, minutes: 60})),
    finished: [], streak: 7, longestStreak: 12, pagesPerDay: 18.5, averageRating: 8, averageDays: 15, readingDays: 70 } satisfies ReadingStats;
};
api.cover = async url => {
  calls.covers++;
  const color = ["#466a71", "#795d73", "#9b7448", "#526a52", "#6b6689", "#a2614c", "#526b89"][Number(url.at(-1))];
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180"><rect width="120" height="180" fill="${color}"/><path d="M10 0v180" stroke="#fff" stroke-opacity=".15"/><path d="M30 50h60m-60 8h60" stroke="#fff" stroke-opacity=".7"/><text x="60" y="112" font-family="serif" font-size="30" fill="#fff" text-anchor="middle">A</text></svg>`)}`;
};
Object.assign(window, { readingFixture: { calls, recover: () => { fail=false; partial=false; statsFail=false; readingChanged(); },
  fail: () => { fail=true; readingChanged(); }, shrink: () => { books=books.slice(0,2); readingChanged(); },
  reset: () => readingChanged(), title: (title: string, delay: number) => { books[0].title=title; delayNext=delay; readingChanged(); } } });

function Fixture() {
  const [size, setSize] = useState({w: Number(query.get("w") ?? 4), h: Number(query.get("h") ?? 4)});
  const [opened, setOpened] = useState(0);
  const ui = useReadingUi();
  return <div style={{padding: 24, height: "100%", overflow: "auto"}}>
    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16, fontSize: 12}}>
      <label>Width <input aria-label="Grid width" type="number" min="2" max="12" value={size.w} onChange={e=>setSize({...size,w:+e.target.value})} style={{width: 48, background:"var(--panel)"}} /></label>
      <label>Height <input aria-label="Grid height" type="number" min="2" max="16" value={size.h} onChange={e=>setSize({...size,h:+e.target.value})} style={{width:48, background:"var(--panel)"}} /></label>
      <output data-testid="opened">Opened {opened}</output><output data-testid="target">{ui.page}/{ui.book ?? "none"}/{ui.adding ? "adding" : "closed"}</output>
    </div>
    <TileGrid><ResizableTile size={size} onResize={setSize} label="Reading Tracker">
      <Panel className="tile tile-fitted" style={{"--extension-accent":"var(--area-reading)"} as CSSProperties}
        title={<ReadingSummaryTitle onOpen={()=>setOpened(n=>n+1)} />} actions={<button className="icon-btn" aria-label="Open Reading Tracker" onClick={()=>setOpened(n=>n+1)}>↗</button>}>
        <ReadingSummary onOpen={()=>setOpened(n=>n+1)} />
      </Panel>
    </ResizableTile></TileGrid>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
