# Axiom on the web

Axiom on the web is **the desktop app's own frontend**, not a copy of it. The
same `src/` is built a second time with `vite --mode web`. Every
`@tauri-apps/*` import is swapped for a small browser stand-in, so the shell,
tabs, sidebars, overview tiles, Analytics, dialogs, all 20 themes, extensions,
settings and Lemma's 3D look are the desktop components themselves. A feature
added to the desktop UI appears on the web without extra work, as long as its
commands have web handlers (see below).

## How it fits together

```
src/                      the app (desktop and web)
src/web/main.tsx          web entry: phone layout + runtime, then <App />
src/web/tauri/*           stand-ins for @tauri-apps/api/{core,event,window} and plugins
src/web/runtime.ts        what Rust is to the desktop: account, IndexedDB copy, sync loop, events
src/web/commands/*.ts     a web handler for every desktop command (invoke("plan_get_day") …)
src/styles/mobile.css     phone layout, loaded only by the web entry
site/src/lib/terminal/*   shared rules and storage (protocol/validation, IndexedDB, planner, board)
site/src/app/api/terminal/*  same-origin routes: session, sync, account, books, calendar-feed
```

- `invoke(command, args)` runs `src/web/commands` instead of Rust. A handler
  reads and writes the account's rows in **the desktop's wire format**
  (snake_case columns, soft deletes, per-field timestamps), queues them in
  IndexedDB and syncs through `/api/terminal/sync`. An edit made on the web
  lands on the desktop exactly as one made there, and the other way round.
- The runtime emits the events Rust would (`data-changed`, `sync-status`,
  `account-changed`), so views reload when another device's changes arrive.
- **Settings sync.** Theme, Overview layout and tile sizes, hidden areas,
  sidebar order, extensions, each area's view options, and Lemma's look and
  personality are `profile_settings` rows (`src/lib/settings.ts`). The web
  reads and writes the same rows, so picking a theme on the web changes it on
  the desktop.
- Sign-in stays in the website's httpOnly cookies. The page never sees a
  token, and every `/api/terminal/*` route checks the session and the request's
  origin. The account route only forwards an explicit list of server calls.
- `/terminal` is rewritten to `site/public/app/index.html`
  (`site/next.config.ts`). The site's `prebuild` runs the web build, so a
  normal site build or deploy includes it.

## Phones

`src/styles/mobile.css` (loaded only by the web entry) rearranges the app
below 760px:

- **Shell:** the activity bar becomes a bottom bar, the sidebar slides over
  the screen and closes when you pick something (`usePhone`, `App.tsx`),
  menus open as bottom sheets, dialogs rise from the bottom, and the page
  never pans sideways (wide things scroll in their own box).
- **Areas:** each area has a section, scoped `[data-platform="web"]` so it
  beats the area's own stylesheet. Headers put actions on one row and tabs
  on a scrolling row; Daily Plan stacks the day and runs the week one day
  under another; Notes, Journal, Goals and Birthdays show the list or the open
  item, with `PhoneBack` to return; Reading, Learning, Finance and Lemma
  reflow to one column.
- Encrypted areas could only be checked empty; look again with data once
  browser encryption lands.

**Lemma's companion** can be dragged anywhere (the pill anywhere, the card by
its frame or grip; arrow keys too) on the desktop and the web. Where it is
lives in `lemma.preferences.spot` as shares of the free space, so it syncs and
fits any window size. On a phone it stays a pill, and tapping it opens Lemma.

## Run it

```sh
npm ci && (cd site && npm ci)        # both sets of dependencies
npm run build:web                    # → site/public/app (gitignored)
cd site && npm run dev               # website on :3000; open /terminal after signing in
```

To work on the app with hot reload, run `npm run dev:web` (Vite on :1430;
`/api` goes on to the website on :3000) and open
`http://localhost:1430/app/`. Sign in on `localhost:3000` first: the cookie
is shared across ports. **Demo mode:** `http://localhost:1430/app/?demo`
(development only) opens without an account and keeps everything in the
browser, which is handy for UI work and browser tests.

`next start` reads `public/` when it starts: restart it after rebuilding the
web app.

## Where each area stands

| Area / part | On the web |
| --- | --- |
| Shell, tabs, sidebars, Overview (move/resize), Ctrl+P, shortcuts | Same as desktop |
| Themes (8 packs, 20 variants), extensions, layouts, Lemma's look | Same as desktop, synced through the profile |
| Account panel: profile, devices, notifications, sign out, delete account, support | Working (website session; delete uses the same login key as the website) |
| Daily Plan | Working: tasks, blocks, routines, rituals, timers, week/month/year, insights, `.ics` files and calendar links. Not yet: Google/Outlook/CalDAV sign-in, editing provider events, publishing |
| Project Board | Working for personal boards: columns, cards, sub-tasks, checklists, labels, templates, recurrence, archive, activity, insights. Not yet: shared boards |
| Reading | Working, with the desktop's rules (units, the day's log adding up, finishing at the end, re-reads, goals, streaks). Open Library search, editions and covers go through `/api/terminal/books` |
| University | Working: terms, modules, timetable generation, stages, behind/coming up |
| Learning | Working: skills, sources, units, review, sessions, pasted contents lists. Not yet: reading chapters from EPUB/PDF files, YouTube playlists |
| Finance, Notes, Journal, Goals, Birthdays | **Locked.** They're end-to-end encrypted and the browser can't unlock the account key yet. They show the desktop's own "not syncing here yet" banner, and changes are refused with a message |
| Lemma's chat | Not yet: its tools (`src-tauri/src/ai`) need porting. The companion and overview tile show |
| Lemma on the desktop, PIN lock, updates | Desktop-only by nature; the web answers quietly |
| Analytics | The page and headline numbers show; each area's report answers "not on the web yet" until ported |

## Next steps, in order

1. **Browser encryption.** Match the desktop's Argon2id + XChaCha20-Poly1305
   key wrapping and field format exactly (`src-tauri/src/vault`). Test against
   desktop vectors, keep unlocked keys in memory only, then add the encrypted
   tables to the browser cache (bump the IndexedDB version) and port each
   area's service the way Reading, University and Learning were ported.
   Notes and Journal must keep the Yjs document format (`notes_save` updates
   and compaction), not whole-text saves.
2. **Analytics** for the plaintext areas (`src-tauri/src/features/*/analytics.rs`).
3. **Lemma's chat**, through the server's `/v1/ai/chat/stream` with the skills
   re-implemented over the web handlers.
4. **Shared boards** through the spaces API (role-checked; never the personal sync endpoint).
5. Learning imports (EPUB contents in the browser; YouTube through a site route).
6. Offline reload (a service worker). Queued edits already survive a reload,
   but loading the page still needs a connection.

## Adding or porting a command

Add the handler to the area's file in `src/web/commands` and mirror the Rust
service, rule for rule. Any table it writes must be in the allowlist in
`site/src/lib/terminal/protocol.ts`. The browser checks that list before
queueing an edit and the sync route checks it again, so a wrong column fails
loudly rather than reaching the desktop. Adding tables that were previously
excluded means bumping the IndexedDB version in `database.ts`, which pulls from
cursor zero.

## Checks

```sh
npx tsc --noEmit                      # root: app + web runtime + shared site rules
npm run build:web
node tests/web-terminal-model.mjs     # and web-planner-parity, web-board-model, web-desktop-planner-model
(cd site && npx next build)
```

`web-terminal.mjs`, `web-board-browser.mjs` and the `web-desktop-planner-*`
browser suites drove the earlier hand-built web shell, which has been
replaced. They need rewriting against `/terminal` (demo mode makes that easy).
