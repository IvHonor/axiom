import type { CSSProperties, ReactNode } from "react";
import { Archive, Bell, BookOpen, Blocks, Brain, CalendarClock, CalendarDays, ChartLine, Check, CheckSquare, ChevronDown, ChevronRight, CircleHelp, CircleUserRound, Clock3, Columns3, Flame, GanttChart, Layers, LayoutDashboard, MoreHorizontal, NotebookText, Activity as ActivityIcon, Palette, Pause, Play, Plus, RotateCcw, Search, SignalMedium, SquareKanban, Table2, Target, Wallet, X, type LucideIcon } from "lucide-react";
import { Mark } from "../Logo";
import s from "./window.module.css";

/** Area colours, from --area-* in the app's src/styles/theme.css; light themes swap them for darker shades. */
const AREA = { plan: "var(--area-plan)", board: "var(--area-board)", reading: "var(--area-reading)", learning: "var(--area-learning)", finance: "var(--area-finance)", notes: "var(--area-notes)", goals: "var(--area-goals)" };
/** Board label colours (src/features/project_board/palette.ts). */
const LABEL = { Design: "#9f8fef", Content: "#4bce97", Dev: "#579dff", Bug: "#f87168" };

/** The window's tabs, in order. The tour switches between them. */
export const WINDOW_TABS: { name: string; icon: LucideIcon; tone?: string }[] = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Daily Plan", icon: CalendarClock, tone: AREA.plan },
  { name: "Project Board", icon: SquareKanban, tone: AREA.board },
  { name: "Reading", icon: BookOpen, tone: AREA.reading },
  { name: "Learning", icon: Brain, tone: AREA.learning },
];

const ACTIVITY: [LucideIcon, string][] = [[CalendarClock, AREA.plan], [SquareKanban, AREA.board], [BookOpen, AREA.reading], [Brain, AREA.learning], [Wallet, AREA.finance], [NotebookText, AREA.notes]];

const tone = (color?: string) => (color ? ({ "--tone": color } as CSSProperties) : undefined);

/** Themes the tour flicks through, from the app's built-in theme packs. Colours live in window.module.css. */
export const WINDOW_THEMES = [
  { id: "modern-dark", name: "Modern Dark", swatch: ["#1f1f1f", "#0078d4"] },
  { id: "nord", name: "Nord", swatch: ["#2e3440", "#88c0d0"] },
  { id: "rose-pine", name: "Rosé Pine", swatch: ["#191724", "#ebbcba"] },
  { id: "catppuccin", name: "Catppuccin Mocha", swatch: ["#1e1e2e", "#cba6f7"] },
  { id: "gruvbox", name: "Gruvbox Dark", swatch: ["#282828", "#fabd2f"] },
  { id: "modern-light", name: "Modern Light", swatch: ["#ffffff", "#005fb8"] },
];

/**
 * Axiom's window, rebuilt in HTML so it stays sharp at any size; Modern Dark (the default theme) unless told otherwise.
 * Sized in design pixels (--px) against a 1280×800 window, relative to the nearest container.
 */
export function AppWindow({ active = 0, theme = "modern-dark", choosingTheme = false }: { active?: number; theme?: string; choosingTheme?: boolean }) {
  return (
    <div className={s.win} data-theme={theme} aria-hidden="true">
      <header className={s.topbar} data-layer data-depth="230">
        <Badge n={1} />
        <span className={s.logo}><Mark size={16} /></span>
        <span className={s.wordmark}>AXIOM</span>
        <div className={s.tabs}>
          {WINDOW_TABS.map(({ name, icon: Icon, tone: color }, index) => (
            <span key={name} className={s.tab} data-active={index === active} style={tone(color)}>
              <Icon strokeWidth={1.5} />{name}{index > 0 && <X className={s.close} strokeWidth={1.75} />}
            </span>
          ))}
        </div>
        <span className={s.iconButton}><CircleHelp strokeWidth={1.5} /></span>
        <span className={s.iconButton}><Bell strokeWidth={1.5} /><i /></span>
      </header>

      <div className={s.workbench}>
        <aside className={s.activity} data-layer data-depth="150">
          <Badge n={2} />
          <span className={s.act}><Layers strokeWidth={1.5} /></span>
          <span className={s.act}><Blocks strokeWidth={1.5} /></span>
          <i className={s.rule} />
          {ACTIVITY.map(([Icon, color], index) => <span key={color} className={s.act} data-area data-active={index + 1 === active} style={tone(color)}><Icon strokeWidth={1.5} /></span>)}
          <span className={s.fill} />
          <span className={s.act}><CircleUserRound strokeWidth={1.5} /></span>
          <span className={s.act} data-active={choosingTheme}><Palette strokeWidth={1.5} /></span>
        </aside>
        <main className={s.main}>
          <Screen index={0} active={active}><Overview /></Screen>
          <Screen index={1} active={active}><DailyPlan /></Screen>
          <Screen index={2} active={active}><Board /></Screen>
          <Screen index={3} active={active}><Reading /></Screen>
          <Screen index={4} active={active}><Learning /></Screen>
        </main>
      </div>

      <footer className={s.status} data-layer data-depth="-70">
        <Badge n={4} left />
        <span><i className={s.dot} />Saved</span>
        <span><i className={s.dot} />Sync <b>·</b> 2 min ago</span>
        <span className={s.fill} />
        <span>Axiom <b>·</b> 0.6.0</span>
      </footer>
    </div>
  );
}

function Badge({ n, left }: { n: number; left?: boolean }) {
  return <span className={s.badge} data-badge data-left={left}>{n}</span>;
}

function Screen({ index, active, children }: { index: number; active: number; children: ReactNode }) {
  return <section className={s.screen} data-active={index === active}>{children}</section>;
}

function Panel({ title, icon: Icon, color, meta, className, depth, badge, children }: { title: string; icon?: LucideIcon; color?: string; meta?: ReactNode; className?: string; depth?: number; badge?: number; children: ReactNode }) {
  return (
    <div className={`${s.panel} ${className ?? ""}`} style={tone(color)} {...(depth !== undefined && { "data-layer": true, "data-depth": depth })}>
      {badge && <Badge n={badge} />}
      <div className={s.head}>
        <span className={s.title}>{Icon && <Icon className={s.titleIcon} strokeWidth={1.5} />}{title}{Icon && <ChevronDown className={s.chevron} />}</span>
        {meta && <span className={s.meta}>{meta}</span>}
      </div>
      <div className={s.body}>{children}</div>
    </div>
  );
}

function Bar({ value }: { value: number }) {
  return <span className={s.bar}><i style={{ width: `${value}%` }} /></span>;
}

function Rows({ rows }: { rows: [string, string][] }) {
  return <div className={s.rows}>{rows.map(([left, right]) => <div key={left}><span>{left}</span><small>{right}</small></div>)}</div>;
}

function Tasks({ tasks }: { tasks: [string, string?][] }) {
  return <>{tasks.map(([title, time], i) => <div className={s.task} key={title}><i data-done={i === 0}>{i === 0 && <Check />}</i>{i < 3 && <b>{i + 1}</b>}<span>{title}</span>{time && <small>{time}</small>}</div>)}</>;
}

function Overview() {
  return (
    <div className={s.overview}>
      <Panel title="Daily Plan" icon={CalendarClock} color={AREA.plan} meta="Sat 24 Oct" className={s.tall} depth={110}>
        {([["09:00", "Morning lecture", "09:00–10:00", LABEL.Design], ["10:00", "Prepare seminar notes", "25 min", LABEL.Content], ["14:00", "EC4051 · Seminar", "14:00–15:30", LABEL.Dev], ["14:30", "Design review", "30 min", LABEL.Design]] as const).map(([time, title, detail, color]) => (
          <div className={s.agenda} key={title} style={tone(color)}><span>{time}</span><div><b>{title}</b><small>{detail}</small></div></div>
        ))}
        <div className={s.subhead}>Today&apos;s tasks</div>
        <Tasks tasks={[["Prepare seminar notes"], ["Read chapter four"], ["Write project proposal"]]} />
        <div className={s.foot}><span>17 tasks left · 16 unscheduled</span><span className={s.link}>Open day ↗</span></div>
      </Panel>
      <Panel title="Project Board" icon={SquareKanban} color={AREA.board} meta="Website relaunch" depth={190} badge={3}>
        <div className={s.stat}><strong>8</strong><span>/ 12</span><small>tasks done</small></div>
        <Bar value={67} />
        <Rows rows={[["Backlog", "3"], ["To do", "3"], ["Doing", "2"], ["Done", "3"]]} />
        <p className={s.note}>Doing · Fix mobile navigation</p>
      </Panel>
      <Panel title="Reading" icon={BookOpen} color={AREA.reading} meta="12 day streak" depth={80}>
        <div className={s.bookRow}><span className={s.cover}>The<br />Creative<br />Act</span><div><b>The Creative Act</b><small>Rick Rubin</small><Bar value={42} /><small>Page 168 of 404</small></div></div>
        <div className={s.subhead}>Up next</div>
        <Rows rows={[["Four Thousand Weeks", "280 pages"], ["Steal Like an Artist", "160 pages"]]} />
      </Panel>
      <Panel title="Goals" icon={Target} color={AREA.goals} meta="2026" depth={150}>
        <div className={s.goal}><span className={s.ring} style={{ "--value": 75 } as CSSProperties} /><div><b className={s.goalValue}>75%</b><b>Read 12 books</b><small>9 done · 3 to go</small></div></div>
        {[["Run 500 km", 62], ["Save £2,000", 40]].map(([name, value]) => (
          <div className={s.budget} key={name}><span>{name}</span><Bar value={value as number} /><small>{value}%</small></div>
        ))}
      </Panel>
      <Panel title="Finance" icon={Wallet} color={AREA.finance} meta="October" depth={60}>
        <div className={s.stat}><strong>£1,240</strong><span>/ £1,800</span><small>spent</small></div>
        {[["Groceries", 62], ["Transport", 38], ["Going out", 84]].map(([name, value]) => (
          <div className={s.budget} key={name}><span>{name}</span><Bar value={value as number} /><small>{value}%</small></div>
        ))}
        <p className={s.note}>4 bills due this week</p>
      </Panel>
    </div>
  );
}

function DailyPlan() {
  const hours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
  const events = [["Morning lecture", "09:00–10:00", 0, 1, 0, 1, LABEL.Design], ["Prepare seminar notes", "25 min", 1, 0.8, 0, 1, LABEL.Content], ["EC4051 · Seminar", "14:00–15:30", 5, 1.5, 0, 0.5, LABEL.Dev], ["Design review", "30 min", 5.5, 0.5, 0.5, 0.5, LABEL.Design]] as const;
  return (
    <Panel title="Daily Plan" icon={CalendarClock} color={AREA.plan} meta={<ChevronRight />} className={s.fill}>
      <div className={s.planHead}><b>Today</b><small>Sat 24 Oct</small></div>
      <div className={s.plan}>
        <div className={s.timeline}>
          <div className={s.planMeta}><small>09:00–16:00</small><small>Current time 11:20</small></div>
          <div className={s.allDay}>All day · Project deadline</div>
          <div className={s.hours}>
            {hours.map((hour) => <span key={hour}>{hour}</span>)}
            {events.map(([title, detail, start, length, left, width, color]) => (
              <div key={title} className={s.event} style={{ "--start": start, "--length": length, "--left": left, "--width": width, "--tone": color } as CSSProperties}><b>{title}</b><small>{detail}</small></div>
            ))}
            <i className={s.now} style={{ "--start": 2.33 } as CSSProperties} />
          </div>
        </div>
        <div className={s.tasks}>
          <div className={s.tasksHead}><span>Today&apos;s tasks</span><small>16 unscheduled</small></div>
          <Tasks tasks={[["Prepare seminar notes", "25m"], ["Read chapter four", "30m"], ["Write project proposal", "35m"], ["Book the photo shoot", "40m"], ["Reply to Sam", "10m"], ["Plan next week", "20m"]]} />
          <div className={s.foot}><span>17 tasks left · 16 unscheduled</span><span className={s.link}>Open day ↗</span></div>
        </div>
      </div>
    </Panel>
  );
}

function Board() {
  /** Labels, title, then optional due date, checklist and estimate. */
  type Card = [(keyof typeof LABEL)[], string, string?, string?, string?];
  const columns: [string, Card[]][] = [
    ["Backlog", [[["Design", "Content"], "Customer stories section"], [["Design"], "Dark mode for docs"], [["Dev"], "Newsletter sign-up form"]]],
    ["To do", [[["Design"], "Pricing page design", "26 Oct", "1/3", "5h"], [["Dev"], "Set up analytics", "29 Oct", undefined, "1h"], [["Dev"], "Compress hero images", undefined, undefined, "1h"]]],
    ["Doing", [[["Content"], "Write launch announcement", "23 Oct", "2/4", "3h"], [["Bug"], "Fix mobile navigation", "22 Oct", undefined, "2h"]]],
    ["Done", [[["Design"], "New logo files"], [["Dev"], "Domain and hosting"], [["Content"], "Content audit"]]],
  ];
  const views: [string, LucideIcon][] = [["Board", Columns3], ["Table", Table2], ["Timeline", GanttChart], ["Activity", ActivityIcon], ["Insights", ChartLine], ["Archive", Archive]];
  return (
    <div className={s.boardScreen}>
      <div className={s.projects}>
        <span className={s.chip} data-active="true" style={tone("#579dff")}><i />Website relaunch</span>
        <span className={s.chip} style={tone("#4bce97")}><i />Thesis</span>
        <span className={s.chip} style={tone("#9f8fef")}><i />Home</span>
        <span className={s.chip}><Plus />New project</span>
        <span className={s.fill} /><span className={s.meta}>11 tasks&nbsp;&nbsp;3 done</span><MoreHorizontal className={s.dim} />
      </div>
      <div className={s.views}>
        <span className={s.segment}>{views.map(([view, Icon], i) => <span key={view} data-active={i === 0}><Icon />{view}</span>)}</span>
        <span className={s.filter}><Search />Filter tasks</span>
        {["Labels", "Priority", "Due"].map((name) => <span key={name} className={s.dropdown}>{name}<ChevronDown /></span>)}
      </div>
      <div className={s.columns}>
        {columns.map(([name, cards]) => (
          <div key={name} className={s.column}>
            <div className={s.columnHead}><span>{name}</span><small>{cards.length}</small><MoreHorizontal /></div>
            {cards.map(([labels, title, due, checklist, estimate]) => (
              <div key={title} className={s.card}>
                <div className={s.labels}>{labels.map((label) => <span key={label} style={tone(LABEL[label])}>{label}</span>)}</div>
                <b>{name === "Done" && <Check className={s.doneMark} />}{title}</b>
                {estimate && <small><SignalMedium />{due && <><CalendarDays />{due}</>}{checklist && <><CheckSquare />{checklist}</>}<Clock3 />{estimate}</small>}
              </div>
            ))}
            <span className={s.add}><Plus />Add a card</span>
          </div>
        ))}
        <span className={s.addColumn}><Plus />Add column</span>
      </div>
    </div>
  );
}

function Reading() {
  return (
    <div className={s.twoCol}>
      <Panel title="Currently reading" icon={BookOpen} color={AREA.reading} meta="1 of 3">
        <div className={s.featured}>
          <span className={`${s.cover} ${s.coverLarge}`}>The<br />Creative<br />Act<small>Rick Rubin</small></span>
          <div>
            <span className={s.meta}>A way of being</span>
            <b className={s.bookTitle}>The Creative Act</b>
            <small>Rick Rubin</small>
            <Bar value={42} />
            <div className={s.splitRow}><small>Page 168 of 404</small><small>42%</small></div>
            <span className={s.button} data-solid="true"><Plus />Log pages</span>
          </div>
        </div>
        <div className={s.subhead}>Recent sessions</div>
        <Rows rows={[["Today · pages 144–168", "35 min"], ["Yesterday · pages 126–144", "28 min"], ["Thursday · pages 101–126", "40 min"]]} />
      </Panel>
      <div className={s.stack}>
        <Panel title="Reading streak" icon={Flame} color={AREA.reading} meta="12 days">
          <div className={s.streak}>{Array.from({ length: 28 }, (_, i) => <i key={i} data-on={i > 15 || i % 5 === 1} />)}</div>
          <p className={s.note}>Longest streak · 19 days</p>
        </Panel>
        <Panel title="Quotes" meta="3 saved">
          {[["Look for what you notice but no one else sees.", "Page 84"], ["The work reveals itself as you go.", "Page 131"], ["Rules direct us to average behaviours.", "Page 162"]].map(([quote, page]) => <blockquote className={s.quote} key={page}>“{quote}”<small>{page}</small></blockquote>)}
        </Panel>
      </div>
    </div>
  );
}

function Learning() {
  return (
    <div className={s.twoCol}>
      <Panel title="Study timer" icon={Clock3} color={AREA.learning} meta="This week · 3h 40m">
        <span className={s.meta}>Photography · Lesson 7</span>
        <b className={s.bookTitle}>Telling a story</b>
        <div className={s.clockFace}>10:30</div>
        <Bar value={42} />
        <div className={s.buttons}><span className={s.button} data-solid="true"><Pause />Pause</span><span className={s.button}><RotateCcw />Reset</span><span className={s.button}><Play />Log session</span></div>
        <div className={s.subhead}>Today&apos;s sessions</div>
        <Rows rows={[["09:10 · Lesson 6, Colour", "25 min"], ["13:40 · Review: Understanding light", "15 min"], ["18:02 · Lesson 7, Telling a story", "Running"]]} />
      </Panel>
      <div className={s.stack}>
        <Panel title="Due for review" icon={RotateCcw} color={AREA.learning} meta="3">
          {[["Understanding light", "Today", "3 days"], ["Finding a composition", "Thursday", "1 week"], ["Seeing in colour", "Next month", "1 month"]].map(([title, when, stage]) => (
            <div className={s.review} key={title}><div><b>{title}</b><small>{when}</small></div><span>{stage}</span></div>
          ))}
        </Panel>
        <Panel title="Chapters" icon={Brain} color={AREA.learning} meta="6 of 10">
          {[["1–3", "Light and exposure", 100], ["4–6", "Composition and colour", 100], ["7", "Telling a story", 40], ["8", "Working with people", 0], ["9", "Editing", 0], ["10", "Printing and sharing", 0]].map(([number, title, value]) => (
            <div className={s.chapter} key={number}><span>{number}</span><b>{title}</b><Bar value={value as number} /></div>
          ))}
          <p className={s.note}>Review later: 3 days → 1 week → 1 month</p>
        </Panel>
      </div>
    </div>
  );
}
