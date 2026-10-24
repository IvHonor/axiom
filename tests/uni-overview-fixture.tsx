// Real University summary, menu and navigation, with every backend command kept in memory.
import { useState, type CSSProperties } from "react";
import { createRoot } from "react-dom/client";
import { addDays, today } from "../src/features/daily_plan/time";
import { api, type Color, type LectureHit, type ModuleCard, type TermCard, type UniSummary as Summary } from "../src/features/uni/api";
import { UniSummary } from "../src/features/uni/UniSummary";
import { UniSummaryTitle } from "../src/features/uni/overview/UniOverviewMenu";
import { uniChanged, useUniUi } from "../src/features/uni/uniUi";
import { Panel } from "../src/shell/ui/Panel";
import { ResizableTile, TileGrid } from "../src/shell/ui/ResizableTile";
import { applyTheme } from "../src/shell/theme/applyTheme";
import { modernThemes } from "../src/themes/modern_themes";
import "../src/styles/theme.css";
import "../src/styles/shell.css";
import "../src/features/uni/uni.css";

const query = new URLSearchParams(location.search);
applyTheme(modernThemes.themes![query.get("theme") === "light" ? 1 : 0]);
const colors: Color[] = ["blue", "teal", "green", "amber", "orange", "red", "pink", "purple", "slate"];
const long = "AnExtraordinarilyLongUnbrokenModuleName".repeat(5);
const term: TermCard = {id: "term1", name: query.has("long") ? long : "Autumn teaching term", startsOn: "2026-09-21", endsOn: "2026-12-13", weeks: 12,
  week: query.has("future") || query.has("ended") ? null : 5};
if (query.has("future")) { term.startsOn = addDays(today(), 30); term.endsOn = addDays(today(), 114); }
if (query.has("ended")) { term.startsOn = addDays(today(), -114); term.endsOn = addDays(today(), -30); }
let modules: ModuleCard[] = Array.from({length: query.has("empty") || query.has("noModules") ? 0 : query.has("one") ? 1 : 17}, (_, index) => ({
  id: `m${index}`, termId: term.id, code: query.has("long") ? long : index % 4 === 0 ? "" : `EC${5000 + index}`,
  name: query.has("long") ? long : ["Applied economics and decision making", "Probability and statistical inference", "Financial markets", "Research methods", "International political economy"][index % 5] + ` · ${index + 1}`,
  color: colors[index % colors.length], credits: index % 3 ? 15 : null, link: null, position: index, lectures: query.has("noLectures") ? 0 : 20,
  attended: query.has("noLectures") ? 0 : 12, caughtUp: query.has("noLectures") ? 0 : index % 10, reviewed: query.has("noLectures") ? 0 : index % 4,
  behind: query.has("caughtUp") || query.has("noLectures") ? 0 : index % 4, shaky: query.has("caughtUp") ? 0 : index % 3,
  percent: query.has("noLectures") ? null : index % 10 / 20 * 100, next: null,
}));
let behind: LectureHit[] = [], upcoming: LectureHit[] = [];
for (const module of modules) {
  const hit = (index: number, overdue: boolean): LectureHit => ({
    id: `${overdue ? "b" : "u"}-${module.id}-${index}`, moduleId: module.id, title: query.has("long") ? long : `${overdue ? "Catch-up" : "Teaching"} session ${index + 1} in ${module.code || module.name}`,
    kind: index % 3 === 0 ? "lecture" : index % 3 === 1 ? "seminar" : "lab", week: index % 3 === 0 ? null : 5,
    day: index === 2 && overdue ? null : addDays(today(), overdue ? -(index + 2) : index % 7), topics: "A topic with a detailed description", recorded: index % 2 === 0,
    attendedOn: null, caughtUpOn: null, reviewedOn: null, confidence: index % 3 === 0 ? 1 : 3, notes: "", position: index,
    moduleCode: module.code, moduleName: module.name, moduleColor: module.color, days: overdue ? index + 2 : index % 7,
  });
  if (!query.has("noLectures")) {
    behind.push(...Array.from({length: module.behind}, (_, index) => hit(index, true)));
    if (!query.has("noUpcoming")) upcoming.push(...Array.from({length: 8}, (_, index) => hit(index, false)));
  }
  module.next = upcoming.find(hit => hit.moduleId === module.id) ?? null;
}
const summary = (): Summary => ({terms: query.has("empty") ? [] : [term], current: query.has("empty") ? null : term.id, modules, behind, upcoming});
let fail = query.has("fail"), mutationFail = query.has("mutationFail"), delayNext = 0;
const calls = {summary: 0, stage: 0};
api.summary = async () => {
  calls.summary++; const captured = structuredClone(summary()), delayed = delayNext; delayNext = 0;
  if (delayed) await new Promise(resolve => setTimeout(resolve, delayed));
  if (fail) throw new Error("Fixture University unavailable");
  return captured;
};
api.setStage = async (id, stage, done) => {
  calls.stage++;
  await new Promise(resolve => setTimeout(resolve, 30));
  if (mutationFail) throw new Error("Fixture stage failed");
  if (stage !== "caught_up" || !done) throw new Error("Unexpected stage mutation");
  const hit = behind.find(hit => hit.id === id)!;
  behind = behind.filter(other => other.id !== id);
  modules = modules.map(module => module.id === hit.moduleId ? {...module, behind: module.behind - 1, caughtUp: module.caughtUp + 1, percent: (module.caughtUp + 1) / module.lectures * 100} : module);
  return {...hit, caughtUpOn: today()};
};
Object.assign(window, {uniFixture: {calls, recover: () => {fail = false; mutationFail = false; uniChanged();}, fail: () => {fail = true; uniChanged();},
  name: (name: string, delay: number) => {modules[0].name = name; delayNext = delay; uniChanged();},
  shrink: () => {modules = modules.slice(0, 1); behind = behind.filter(hit => hit.moduleId === modules[0].id); upcoming = upcoming.filter(hit => hit.moduleId === modules[0].id); uniChanged();}}});

function Fixture() {
  const [size, setSize] = useState({w: Number(query.get("w") ?? 4), h: Number(query.get("h") ?? 4)});
  const [opened, setOpened] = useState(0);
  const ui = useUniUi();
  return <div style={{padding: 24, height: "100%", overflow: "auto"}}>
    <div style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginBottom: 16, fontSize: 12}}>
      <label>Width <input aria-label="Grid width" type="number" min="2" max="12" value={size.w} onChange={event => setSize({...size, w: +event.target.value})} style={{width: 48, background: "var(--panel)"}} /></label>
      <label>Height <input aria-label="Grid height" type="number" min="2" max="16" value={size.h} onChange={event => setSize({...size, h: +event.target.value})} style={{width: 48, background: "var(--panel)"}} /></label>
      <output data-testid="opened">Opened {opened}</output><output data-testid="target">{ui.page}/{ui.module ?? "none"}/{ui.dialog?.kind ?? "closed"}/{ui.term ?? "current"}</output>
    </div>
    <TileGrid><ResizableTile size={size} onResize={setSize} label="University">
      <Panel className="tile tile-fitted" style={{"--extension-accent": "var(--area-uni)"} as CSSProperties} title={<UniSummaryTitle onOpen={() => setOpened(count => count + 1)} />}
        actions={<button className="icon-btn" aria-label="Open University" onClick={() => setOpened(count => count + 1)}>↗</button>}>
        <UniSummary onOpen={() => setOpened(count => count + 1)} />
      </Panel>
    </ResizableTile></TileGrid>
  </div>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
