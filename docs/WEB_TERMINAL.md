# Web terminal implementation

The target is desktop feature parity. This is the first stage, not a claim that
all ten areas already work in the browser.

## Run and inspect

From `site`, run `npm run dev`, then open `http://localhost:3000/terminal`.
Use an existing approved Axiom account. The site uses its existing
`AXIOM_API_URL` and `AXIOM_WEB_PROXY_SECRET` settings. No new credentials or
database are needed. The account overview and signed-in `/web` preview both
link to the terminal.

The terminal uses real account sync. Editing a synced Daily Plan task here also
changes it on desktop after that app syncs. It does not read the desktop's local
database. The web terminal does not yet unlock the desktop's encrypted calendar
connection records; calendar sign-in credentials remain local to each device.

## Foundation delivered

- [x] Authenticated, full-screen `/terminal` route; existing website keeps its frame.
- [x] Activity rail, area sidebar/search, tabs, close/restore, overview and mobile layout.
- [x] Modern Dark, Modern Light and Ember; account-scoped appearance/navigation preferences.
- [x] Sidebar shortcut and theme chord; keyboard-accessible controls and native dialogs.
- [x] Scrollbar-free tab strip with wheel/trackpad scrolling and active-tab visibility.
- [x] Existing httpOnly session; tokens are never passed to terminal client components.
- [x] Same-origin, authenticated, account-bound sync proxy with a bounded JSON body.
- [x] Desktop wire format: snake_case columns, field changes, timestamps and soft deletes.
- [x] Per-account IndexedDB cache and durable outbox; server pagination and cursor.
- [x] Original timestamps retained on retries; edits made during sync remain queued.
- [x] Cross-tab sync locking where Web Locks are available and cache refresh via BroadcastChannel.
- [x] Reconnect, foreground and minute-by-minute sync; visible errors and manual retry.
- [x] Encrypted tables refuse web writes and are excluded from the browser cache.

## Porting sequence and remaining parity

1. **Daily Plan — planner tools implemented; provider integration remains.**
   The planner and its sidebar now render the actual desktop React components,
   using the same theme tokens and scoped copies of the original CSS. Day, week,
   month, year, insights, focus, rituals, menus and dialogs therefore share their
   presentation with Windows/macOS. The web command adapter supplies the native
   UI contract from the account's IndexedDB/outbox; desktop still uses Tauri.
   Task CRUD/completion, estimates, deadlines, top-three priorities, desktop-style
   quick-add, exclusive focus timers, inbox/earlier/day/week/month/year views,
   due-soon reminders and individual/batch carry-over are working. The day/week
   timeline supports drawing blocks, moving/resizing with pointer or keyboard,
   cross-day moves, task drops, overlap lanes, exact-time editing and full-day
   hours. Settings, buffer/capacity, fit-into-day and replan use imported busy time.
   Routines appear automatically on opening a day; future range views preview
   occurrences without writing a year of blocks. Desktop IDs and tombstones
   preserve skipped occurrences; edits affect future blocks while preserving
   history. Guided morning and shutdown flows, intentions/reflections, markers,
   streaks, pace, priority completion, eight-week focus and fourteen-day completion
   history are implemented. Personal board suggestions and linked completion
   preserve column changes, history, recurring copies, labels and checklists.
   The overview offers glance, now/next, agenda, checklist, priorities, progress,
   strip, fitted timeline, split, week and month views with remembered options.
   Remaining: direct Google/Outlook/CalDAV account sign-in, editing provider
   events, automatic publishing and shared-board links. These require a hosted
   credential service and the role-checked spaces protocol respectively. Do not
   put provider credentials into the browser cache or personal-sync plaintext.
2. **Project Board — personal boards implemented.** Project create/rename/color/
   delete, default/custom columns, column ordering, completion flags and WIP
   warnings; card CRUD, descriptions, priorities, dates, hour estimates, recurrence,
   native drag-and-drop ordering/moves and keyboard-accessible move controls;
   one-level subtasks, editable checklists and checklist-to-subtask conversion;
   project-scoped labels and filters; templates with labels and fresh checklists;
   archive/restore, project/card activity, eight-week throughput, thirty-day progress,
   cycle time and workflow load. Board/table/timeline/archive views and a project
   portfolio are live. Cards can be linked to today's Daily Plan; board and planner
   moves share completion/history/recurrence rules. UUIDv7 IDs preserve desktop
   history ordering. Deletion removes dependent records, promotes deleted parents'
   subtasks and leaves other projects intact. An overview card shows personal
   projects and upcoming deadlines. Remaining: shared boards/invites/roles and
   the desktop's richer fitted overview variants. Shared records must use the
   spaces protocol, not the personal sync endpoint.
3. **Reading.** Library/search, editions/covers, shelves, progress and sessions,
   audio/ebook support, notes/quotes, ratings and annual goals.
4. **University.** Terms/modules, timetable generation, attendance, catch-up,
   review and every overview view.
5. **Learning.** Skills/sources, EPUB/PDF/playlist imports, chapter progress,
   study timers, spaced review and overview views.
6. **Browser encryption.** Match the desktop Argon2id and XChaCha20-Poly1305
   wrapping and field format exactly. Verify interoperability using desktop
   vectors, authenticated field paths, tamper tests and recovery. Keep unlocked
   keys in memory; implement lock/unlock and explicit cache retention before
   opening private areas. Bump the cache version and pull from cursor zero when
   adding previously excluded tables.
7. **Finance.** Accounts, transactions/categories, budgets, recurrence, imports,
   currencies/rates, reports and all overview views.
8. **Notes.** Reuse the rich-text editor and Yjs document format, folders/tags,
   backlinks, sticky notes and export. Do not replace collaborative documents
   with whole-text last-write-wins records.
9. **Journal.** Same editor/document interoperability, entries/prompts,
   moods/energy/tags, calendar, streaks/memories, insights and export.
10. **Goals and Birthdays.** Full CRUD and domain behavior, cross-area progress,
    milestones/check-ins/plans; contacts/imports, gifts and reminders.
11. **Shell parity.** All theme packs/fonts, install/enable/hide extensions,
    overview tile movement/resizing and fitted views, profile, notifications,
    PIN/idle lock, data export, admin tools and browser-specific file handling.
12. **Release readiness.** Actual desktop-to-browser-to-desktop tests, concurrent
    edits and migration fixtures, Safari/Firefox/Chromium, accessibility, account
    switching/logout and cache policy, load/performance and production deployment.

Only enable a feature after its domain side effects and wire compatibility are
implemented. Add its tables to the proxy's explicit validators and browser
cache allowlist together. Keep desktop-only capabilities out of working web
controls until their replacement is implemented.

## Web calendars

Use Daily Plan → Planner settings → Calendars → Import / export calendar files
to import an `.ics` file or subscribe to an HTTPS/
`webcal` iCalendar link. Links refresh every fifteen minutes while the terminal
is open; Refresh retries immediately. Offline/failed refreshes keep the last
successful snapshot. Show/hide and removal affect scheduling, capacity and all
calendar views. Export a date range (up to one year) as `.ics`, including routine
previews. Imports support repeats, exceptions, cancellations, overnight/all-day
events and time zones. Events from files/feeds are read-only. Axiom's exported
blocks carry the desktop marker so reimporting does not count them as meetings.

The parser is `ical.js`; missing IANA time-zone definitions use the browser's
Intl data. Imports are capped at 200 KB, 2,500 source events, 5,000 occurrences
per view and 30,000 expansion steps; sub-daily recurrence is rejected. The feed
proxy only uses public IPv4 HTTPS endpoints on port 443, pins DNS results and
rechecks redirects. It forwards no Axiom credentials. IPv6-only feeds are not
supported. Files split into bounded `web_plan_calendar_chunks`; parent
`web_plan_calendars` records select a complete revision. Both are web-only tables
ignored by current desktop clients. Contents and private links in these web-only tables sync without
end-to-end encryption, as the UI and both privacy notices explain. Existing
desktop encrypted calendar connection records are not unlocked by this web
implementation, and desktop-fetched events do not appear automatically.

The browser cache is now version 5. Upgrading resets the pull cursor to include
newly supported tables and retains the outbox. A save coalesces repeated edits
to one row before assigning operation IDs, so batch priority cleanup cannot
overwrite a later move. Push batches respect both count and byte limits.

## Checks

From the repository root:

```powershell
node tests/web-terminal-model.mjs
node tests/web-planner-parity.mjs
node tests/web-board-model.mjs
node tests/web-desktop-planner-model.mjs
```

Build the site (`npm run build` inside `site`), then:

```powershell
node tests/web-terminal.mjs
```

Use the existing `PLAYWRIGHT_MODULE` setting if Playwright is installed outside
the repository. The browser suite starts its own local account/sync fixture and
production Next.js server, uses fictional accounts, and stops both. It never
signs in to a real account. `web-desktop-planner-browser.mjs` checks the shared
task UI, quick-add, linked blocks, focus/timers/notes, working-day settings,
all calendar views, routines and calendar import/export. The suite also checks
durable retry, encrypted-area boundaries, account isolation, preferences and
cache upgrades. `web-desktop-planner-visual.mjs` builds an independent desktop
UI fixture with its original CSS and compares computed typography, colours,
dimensions and spacing for all five views and the sidebar in Dark, Light and
Ember. The adapter model test checks native DTOs, serialized edits, timer
idempotency, move/delete cleanup, day markers and virtual routine tombstones.
The model suite covers recurrence exceptions, DST, overnight/all-day events,
source chunking, feed-address restrictions and recurring board tasks. The board
model suite checks schema validation, project/column/card side effects, recurrence,
templates, subtasks, deletion scope, labels and ordered IDs. The browser suite
also runs `web-board-browser.mjs`, covering real project/card creation, labels,
checklist edits/conversion, native dragging, WIP indicators, recurrence, archive/
restore, table/timeline/activity/insights, templates, deletion confirmation,
planner links and phone layout. Screenshots are in
`.qa.local/terminal`.

The site builds shared source outside `site`; install dependencies at both the
repository root and in `site`. The CSS generator runs before dev/build, or
manually via `npm run desktop:styles`. `node site/scripts/desktop-planner-styles.mjs --check`
detects stale generated styles. Vercel must allow source outside its `site` root;
the checked-in install command and website CI install both sets of dependencies.

This stage is not deployed. Full offline application reload/service-worker
support is not implemented: the outbox survives a reload, but loading the page
itself still needs a connection. IndexedDB is browser-local storage and should
not be treated as an independent backup.
