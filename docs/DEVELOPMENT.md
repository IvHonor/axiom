# Developing Axiom

Axiom is a [Tauri 2](https://tauri.app) desktop app: a Rust backend with a React, TypeScript and Vite frontend. Data lives in a local SQLite database (via SeaORM), so the app works offline and every action is instant. The optional account and sync server in `server/` is an Axum app on Postgres.

## Setup

1. Install [Rust](https://rustup.rs), [Node.js](https://nodejs.org) and, on Windows, the MSVC Build Tools.
2. `npm install`
3. `npm run tauri dev`

The database is created on first launch at `%APPDATA%\app.axiom.desktop\axiom.db` (Windows) or `~/Library/Application Support/app.axiom.desktop/axiom.db` (macOS). The status bar shows `Saved` once it's open.

### Accounts while developing

Development builds sign in against a server on your own computer:

1. Copy `server/.env.example` to `server/.env` and fill in `DATABASE_URL` (Postgres, e.g. a free [Neon](https://neon.tech) database) and `JWT_SECRET`.
2. `npm run server` in a second terminal (listens on `http://localhost:8787`).

The sign-in is kept in the operating system's credential store (Windows Credential Manager, macOS Keychain), never in a file.

Password reset codes are emailed through [Resend](https://resend.com). Without `RESEND_API_KEY` the server prints each email in its output instead, so "Forgot password?" works locally with no setup.

To point a development build at another server, set `AXIOM_SERVER_URL` before `npm run tauri dev`.

## Commands

- `npm run tauri dev`: run the app while developing
- `npm run tauri build`: build the installable app
- `npm run server`: run the account server locally
- `cargo test --workspace`: run every Rust test (app, server and protocol)
- `cargo audit`: check Rust dependencies for known vulnerabilities (exceptions, with reasons, are in `.cargo/audit.toml`)

The same build, tests and audits run on GitHub for every push and pull request (`.github/workflows/ci.yml`).

## Layout

| Path | What lives there |
| --- | --- |
| `src/shell/` | The app shell: top bar, activity bar, sidebars, status bar, overview |
| `src/shell/account/` | The Account sidebar's forms: sign in, devices, password, export, delete |
| `src/extensions/` | The extension registry (`index.ts`) and the manifest and `Theme` types (`types.ts`) |
| `src/features/` | One folder per life-area feature |
| `src/themes/` | One folder per theme extension: `modern_themes` (built in), `wireframe_themes`, `ember_themes` |
| `src/lib/` | Typed wrappers for every Tauri command React calls |
| `src-tauri/src/db/` | The database layer: opens the local SQLite file and runs migrations |
| `src-tauri/src/features/` | One Rust module per feature: entities, queries, commands |
| `src-tauri/src/account/` | Signing in and out: talks to the server, keeps the sign-in in the credential store |
| `src-tauri/src/sync/` | Background sync: change-tracking triggers, push and pull, linking data to an account |
| `server/` | The account and sync server: Axum, SeaORM on Postgres, Argon2id passwords, JWT plus rotating refresh tokens |
| `crates/protocol/` | Request and response types shared by the app and the server |

**Drag and drop.** The window sets `dragDropEnabled: false` in `tauri.conf.json`. Left on (Tauri's default), it replaces WebView2's drag and drop on Windows so it can report files dropped on the window, and HTML drag and drop in the page (the Daily Plan's tasks) silently stops working. Tests that fire drag events from script don't notice, so check a change here with a real mouse.

## Adding an area

An area that's listed in `src/extensions/index.ts` without a `View` shows as **Coming soon** and can't be installed. To build one, give it a folder in `src/features/<id>/` exporting its manifest with a `View` and a `Summary`, and a Rust module in `src-tauri/src/features/<id>/`. To make its data sync, list its tables (see `SYNCED_TABLES` in `src-tauri/src/features/project_board/mod.rs`). Synced tables need text UUID ids, an `updated_at` column, soft deletes (`deleted_at`) and no foreign keys.

**The Playground's overview tile** (`src/features/playground/overview/`) focuses on Friends and Global leaderboards. Automatic scales from a title-bar rank or compact Pulse to a fitted list, a race in wide shallow tiles, and a dashboard with standings, podium and streak. `model.ts` uses measured content dimensions after reserving toolbar space. Nine manual layouts remain available; saved Nexus (`hub`) layouts migrate to the leaderboard. The overview neither renders nor polls Nexus. Layout, metric, period and audience choices are kept per tile size and synced. Global is disabled for friends-only metrics. `data.ts` deduplicates board requests across tiles, isolates cached boards by account, day and audience, and supports retry after failure. Clicking a ranking opens the full leaderboard with the same filters. The same components run on desktop and web.

**Nexus** (`src/features/playground/nexus/`, the server's side in `server/src/hub.rs`, types in `crates/protocol/src/hub.rs`) is the Playground's live, global 3D city of AIs, and is a desktop app feature only: on the web its tab shows a "get the desktop app" card, and the web app doesn't offer its calls. It's live only: entering puts you in the server's memory (no database work after that), `useLive.ts` checks in about once a second with where you are (metres on the city map), and leaving, closing Axiom or 15 quiet seconds takes you out. Each check-in sends back only who's within 200 m of you, the nearest 40 (`VIEW`, `MAX_SEEN`): your district and the Nexus beside it, so a full city costs each person little. The server's `DISTRICTS` (for counting who's where) must match `world.ts`'s; a test checks. People talk with fixed emotes and phrases (`EMOTES`, `PHRASES`), never free text, so nothing needs moderating; the server refuses anything else, and an emote or phrase aimed at someone only reaches them if they're near. While someone's in, anyone can see their picture. `world.ts` is the map (districts, roads, what's solid) and pathfinding, with its own tests; `routes.ts` is how the city hangs together: each district an island at its own height (the Nexus 10 m, Memory 18, Computation 6, the floating Simulation Chambers 24, the Model District 3) over a river of light nobody can walk on, joined only by named routes, the Rialto of Recall (a market bridge with stalls and a bench), the Golden Gate, the Great Firewall (a wall walk), Tower Bridge, the Thousand Steps and the Bifröst, plus the Ascension Lift, which floats you up a gravity stream; `planTrip` in `world.ts` decides whether walking or the lift is quicker, and `bridges.ts` draws the islands, the river and every route. Tests check every route joins its islands smoothly, none cross, and the lift's taken when it's quicker. `levels.ts` adds height: raised terraces (the Nexus's dais, the Great Library's terrace) reached only by stairs, their edges solid balustrades and the stairs railed, so walking stays on the flat map while how high you stand comes from `cityHeight`; the tests walk every route checking the ground never jumps; `engine.ts` draws it with Three.js (a city-map camera, click or WASD to walk, a neon glow, districts built as you near them and taken down once far away); `districts.ts` builds what each district looks like (the Great Library, the compute cubes, the domes and ring track, the gardens' pyramids and pool, plus the road arches and the far skyline) from the pieces in `kit.ts` (and `terrain.ts` for the terraces, steps and balustrades), with streams of light winding beside the roads, an aqueduct ring of arches round the Nexus carrying its own stream, beams of light, and a network of light strung across the sky, standing each building exactly where `world.ts` says it's solid, so what you see is what you bump into. Anything that moves says how in its `userData` (spin, float, pulse, scroll) and the engine gathers those once per district rather than walking the scene each frame; Everyone else near you is drawn with their own AI (built once when they appear, with no lights of its own so nobody's arrival recompiles shaders), gliding between check-ins, with a name tag and a bubble laid over the 3D as real text (`CSS2DRenderer`); past 160 m their AI isn't drawn, and past 95 m nor is their tag. `Nexus.tsx` adds the loading screens, district title cards, discovery, fast travel, the minimap (friends in gold), the emote bar and phrases, toasts for waves and hi's sent to you, and profiles from a click on someone's AI or tag (`hub/Profile.tsx`). `hub/Hub.tsx` is the tab outside: who's online and where, and the way in. Nexus loads only when someone steps in.

Some of Nexus's buildings can be gone into: the Great Library (stacks with aisles between, reading nooks), the Processor Core under the ziggurat, the Observatory in the great dome, and the Model Forge in the Model District's great pyramid. `interiors.ts` has each one's layout, its doors (a ring on the ground outside to step on, and one inside to step back out) and its own walkable map; `insides.ts` draws them. Maps, the city's and the rooms', come from `walkmap.ts` (what's solid, and the pathfinding), so a room is just another map. Stepping on a door's ring brings up a loading screen while the engine puts the city away (hidden, not taken down, so coming back out is instant) and builds the room in its place. Inside, check-ins say which building you're in, with your position from the middle of the room, and the server sends back only who's inside with you; a wave from outside doesn't reach in. The server's `INTERIORS` (ids, districts and sizes) must match `interiors.ts`; a test checks.

The finishing touches: spots (`SPOTS` in `interiors.ts`) do something while you stand in them: the Simulation Chambers' dance floor makes your AI dance for everyone near, the library's nooks sit it down to read, and the Observatory's telescope tips the camera back to the stars. `sound.ts` makes all of Nexus's sound on the spot with Web Audio, no recordings: a soft chord for each place, crossfading as you go, and small sounds for doors, emotes, waves and finds; it starts on your first click (browsers require it), and muting is remembered (`axiom.nexus.muted`). A dashed line shows the way you're walking, the pointer turns to a hand over people and doors, zoom and tilt ease, and `?` brings up the controls. If a computer can't keep above about 32 frames a second for a few seconds, the engine draws fewer pixels, then drops the glow, and says so once.

An extension marked `core` (Lemma, the Playground) is part of Axiom rather than one area: it gets its own group in the activity bar, isn't listed with the areas or under Extensions, and is switched on and off in Account → Features. Entering the Playground switches it on; switching it off while on its boards leaves them (friends stay).

To give it a section in **Analytics**, add an `<id>_analytics` command that takes `unit` ("week" or "month"), `day` and `today`, builds a `Period` (`src-tauri/src/features/period.rs`) and returns the area's report: a `Headline` for the scorecard (its `trend` comes from `Period::headline`), `Compare`s for its other numbers, and one row a day for its charts. Keep the report in the feature's own `analytics.rs`. On the React side, set `area.analytics` with `defineAnalytics` (`src/shell/analytics/measures.ts`) and draw the section with the charts in `src/shell/ui/charts/Charts.tsx`, which take the area's colour from the section. Daily Plan (`src/features/daily_plan/analytics.tsx`) is a short example.

## Making a theme

Copy `src/themes/modern_themes/index.ts` to a new folder, change the colours, fonts, `style` (corner radius, brackets, button style, clock) and `labels`, then add the export to `EXTENSIONS` in `src/extensions/index.ts`. Every field is documented on the `Theme` type in `src/extensions/types.ts`. Give each theme extension a dark and a light theme so it works with "Match system light/dark".

## How sync works

The local database is always the source of truth, so nothing waits on the network.

- **Tracking:** SQLite triggers note every changed row in `sync_outbox`, so features need no sync code.
- **Push:** a few seconds after an edit, only the fields that changed since the last sync are sent.
- **Merge:** the server stores each row as JSON and keeps the newest value per field, so two computers editing different fields of one task both keep their edit.
- **Pull:** at launch, every minute, after signing in and when the network comes back, the app fetches rows changed since it last pulled. A row with unsent local edits is skipped until those edits are pushed, so a pull never overwrites them.
- **Signing in** on a computer that already has projects asks whether to upload them to the account or replace them with the account's data. **Signing out** asks whether to keep the data on the computer.

## Account features

The Account sidebar (the person icon, bottom left) has:

- **Sync:** status and a "Sync now" button.
- **Devices:** every computer signed in to the account, each of which can be signed out from here.
- **Password:** change it (other devices are signed out), or reset it with an emailed 8-character code from the sign-in screen. Codes last 30 minutes, allow 5 tries, and each address can request 3 an hour.
- **Your data:** export everything on this computer as JSON to Downloads (also available signed out).
- **Delete account:** needs the password and removes the account and everything synced to it from the server. The boards on the computer stay.

## Running your own server

The server is a plain Docker image (`server/Dockerfile`), so it runs on any container host. `render.yaml` sets it up on Render's free plan:

1. Fork this repo.
2. In Render: **New → Blueprint**, pick the repo, and paste your Postgres connection string when asked for `DATABASE_URL`. Render generates `JWT_SECRET` itself. For reset emails, also fill in `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain you've verified in Resend).
3. Once it's live, open `https://<your-service>.onrender.com/health`; it should say `ok`.
4. Build the app with that address: `AXIOM_SERVER_URL=https://<your-service>.onrender.com npm run tauri build` (in PowerShell, set `$env:AXIOM_SERVER_URL` first). Release builds have no default server on purpose: without the variable, accounts are switched off rather than pointing at an address you don't control.

The free plan sleeps after 15 minutes without requests and takes about a minute to wake, so the first sign-in after a quiet spell is slow. The app waits for it and says so.

## Calendar accounts

The Daily Plan connects to Google Calendar, Outlook and iCloud: it shows their events as busy time and publishes the plan into one calendar. iCloud (and any CalDAV server) needs no setup: users sign in with an [app-specific password](https://support.apple.com/en-us/102654). Google and Microsoft only talk to apps registered with them, so each copy of Axiom is built with client ids:

| Variable | What |
|---|---|
| `AXIOM_GOOGLE_CLIENT_ID`, `AXIOM_GOOGLE_CLIENT_SECRET` | A Google OAuth client of type *Desktop app* |
| `AXIOM_MICROSOFT_CLIENT_ID` | A Microsoft Entra app registration |

Put them in `src-tauri/.env` (copy `src-tauri/.env.example`; git ignores `.env`) for development, and in the repository's secrets for releases (`release.yml` passes them in). Without them, that provider's button says it isn't set up. A desktop app's client secret can't really be kept secret, and Google says as much; PKCE protects the sign-in instead. It's still kept out of the repo so nobody else builds on your quota.

**Google.** In the [Google Cloud console](https://console.cloud.google.com):

1. Create a project, then under **APIs & Services → Library** enable the **Google Calendar API**.
2. Under **Google Auth Platform**: fill in **Branding**; in **Audience** choose *External* and add your Google account as a test user; in **Data access** add the scopes `calendar.calendarlist.readonly`, `calendar.events.readonly`, `calendar.events.owned` and `calendar.app.created`.
3. Under **Clients**, create a client of type **Desktop app** and copy its id and secret.

While the app is in *Testing*, only test users (up to 100) can connect, and Google expires their sign-in after 7 days, so they reconnect weekly. Publishing it for everyone needs Google's verification of those (sensitive) scopes: a privacy policy and a verified domain.

Axiom asks to see calendars and events, to change events on the user's own calendars (only when they edit one in the event panel), and to manage calendars it creates. The plan goes into an "Axiom" calendar, so publishing never touches the user's other calendars. Accounts connected before `calendar.events.owned` was added can read but not edit until they connect again.

**Microsoft.** In the [Microsoft Entra admin center](https://entra.microsoft.com), **App registrations → New registration**:

1. Supported account types: *Accounts in any organizational directory and personal Microsoft accounts*.
2. Redirect URI: platform **Public client/native (mobile & desktop)**, value `http://localhost` (Microsoft ignores the port, which Axiom picks each time).
3. Copy the **Application (client) ID**. Under **API permissions** add Microsoft Graph, delegated, `Calendars.ReadWrite`. No client secret is needed.

Some workplaces only let staff use apps an administrator has approved, or from verified publishers; personal Outlook.com accounts work straight away.

## Lemma on the desktop

Lemma also lives in a small see-through window of his own (`src-tauri/src/desk.rs`, drawn by `src/shell/desk/Desk.tsx`), which the main window brings out and puts away (`src/shell/desk/useDesk.ts`).

- **Running in the background:** with him set to be on the desktop always, closing Axiom's window only hides it, and Axiom carries on. His right-click menu reopens it or quits. `tauri-plugin-single-instance` makes starting Axiom again bring that window back rather than open a second copy; on macOS, so does clicking the Dock icon.
- **macOS:** his window needs `macOSPrivateApi` (in `tauri.conf.json`, with Tauri's `macos-private-api` feature) to be see-through. That uses private macOS APIs, so Axiom can't go on the Mac App Store as it stands (it's distributed directly). `src-tauri/src/desk/macos.rs` joins normal/full-screen Spaces and, on macOS 13+, other apps' Stage Manager sets; the window stays visible when another app becomes active. Cursor tracking reads AppKit coordinates relative to the webview, so Retina and mixed-scale displays do not mix global cursor/window scales. Attached panels and the tucked edge sidebar use native Liquid Glass on macOS 26+, with Popover vibrancy on older systems, following the system appearance independently of the app theme. `useDesktopGlass.ts` sends only visible panel bounds; the character's surrounding window stays transparent. These paths are native-Mac-only. Time away from the keyboard comes from `ioreg` and the chime from the system sounds; full-screen apps, calls and the window in front are only detected on Windows so far.
- **What it checks on the computer:** idle time, a full-screen app, another app using the microphone or camera, and the window in front (Windows). None of it leaves the computer. The weather, when turned on, sends a typed place, or coordinates rounded to about 10 km, to Open-Meteo.
- **Tests:** `node tests/desk.mjs` for him, `node tests/sidebar.mjs` for the sidebar (see `tests/README.md`).

The Mac's tucked glass tab uses `glassOutline.ts` for one Bezier outline shared by WebKit's clip and AppKit's antialiased shape mask. Its shoulders flow into the physical display edge; vertical positioning still respects the work area. Native glass hosts clip their contents at the display's backing scale, including ordinary rounded panels. The attached tab stays still during arrival while Lemma animates inside it.

Glass regions are anchored to the top of the native content view, matching CSS, and window resize events refresh their placement even when DOM bounds are unchanged. Without both, an asynchronous window resize can leave the material vertically offset from the web tint and character.

## The Playground

Friends and leaderboards (`src/features/playground/`, `server/src/playground.rs`, types in `crates/protocol/src/playground.rs`). Accounts are end-to-end encrypted, so the server can't count anything: `playground_days` (`src-tauri/src/playground.rs`, with a `playground_days` in each feature's `analytics.rs`) reads how much of each metric happened on each day, `stats.ts` turns that into weeks, months, totals and streaks, and only the metrics the person shares are sent (`store.ts`, soon after launch, every ten minutes and after synced changes). The server checks each number against the metric's daily cap and ranks them; a metric someone stops sharing is deleted.

- **Metrics** live in `METRICS` (protocol) and `RULES` (`rules.ts`); keep the two in step. `global: false` ones (sizes people choose themselves, like tasks) only appear on friends' boards.
- **Friends** are for everyone signed in, not only Playground players: the friends button in the top bar (`src/shell/friends/FriendsButton.tsx`, sharing `FriendsPanel` with the Playground sidebar’s friends dialog) asks for a handle, nothing else. `in_playground` says who's on the boards; leaving them deletes the numbers but keeps the handle and friends. Friends are added by handle (they accept) or friend code (instant; making a new code retires the old one). Cheers are once per friend per UTC day.
- **Preferences** live in the Playground sidebar (`PlaygroundSidebar.tsx`, `SharingPreferences.tsx`). Participation is Off (browse only), Friends only or Friends + Global. Saving Off confirms deletion of published totals, while keeping the handle and friendships. The board endpoint permits browsing with a handle; publishing still requires participation. `changeSharing` serializes consent changes after any in-flight publish, and stale refreshes cannot replace newly saved consent. Per-activity controls reuse the server's sharing/deletion rules.
- **Display and alerts** (`preferences.ts`, synced as `playground.preferences`) cover default board filters, starting page, compact rows, companions, podium and reduced animations. Explicit overview navigation opens its matching board once; ordinary visits use the starting-page and default-board choices. `useBoardAlerts.ts` compares refreshes while leaderboards are open, with separate toggles for cheers, rank drops and weekly/monthly results. It uses a quiet initial baseline and no OS/email notifications. Friends open in `FriendsDialog.tsx`, with the garden, codes, add-friend form, requests, cheers and removal together; this content is not mounted in the sidebar until requested.
- **The garden** (`src/features/playground/garden/`) sits atop the friends list: an AI garden where everyone's Lemma lives, with its scenery (floating islands, circuit trees, crystals, the data pool, the hologram fence, drones) in `Scenery.tsx`. Lemmas rest on charging pads at night; a seed nobody reaches grows into a plant, kept on this computer (`axiom.garden.plants.<user>`). `engine.ts` is the life (wandering, visits and chats, play, dancing, sleep at night, seeds, pokes, arrivals, the gate) as plain logic with its own tests; `Garden.tsx` draws it, moving Lemmas every frame through refs and re-rendering only when what they do or say changes. Lemmas there are the 2D illustration, never 3D, so a full garden stays light; it pauses when hidden and stands still with reduced motion.
- **Lemmas** on the boards are drawn from the `LemmaCard` each person shares (look, name, personality), redrawn with the viewer's `Face` and the owner's perks, so keepsakes only show on Lemmas that earned them. It follows the person's Customise choices automatically.
- **On the web** the calls go through `/api/terminal/account`; the browser can't read Journal or Goals, so it never sends `active` or those metrics.

## Releasing

The app's version lives in `package.json` (`tauri.conf.json` reads it from there). To publish one:

```
npm version 0.3.0        # or: npm version patch / minor
git push --follow-tags
```

`npm version` updates the version and makes a commit and a `v0.3.0` tag. Pushing the tag runs `.github/workflows/release.yml`, which builds the Windows installers, signs them for the updater, and publishes a GitHub Release with `latest.json`. Edit the release's notes on GitHub afterwards: installed copies show them in the update prompt.

Installed copies check `releases/latest/download/latest.json` about ten seconds after launch and every six hours, or when the version in the status bar is clicked. They only install updates signed with the key whose public half is in `plugins.updater.pubkey` in `tauri.conf.json`.

**The Mac signing certificate.** macOS remembers "Always Allow" on the keychain prompt for one signing identity. Signed with a throwaway one (`"signingIdentity": "-"`), every update is a new app and people are asked again. So releases are signed with Axiom's own self-signed certificate: make it once with `bash scripts/make-mac-signing-cert.sh` (it goes to `~/axiom-signing`, outside the repo) and add the repository secrets `MACOS_CERTIFICATE` and `MACOS_CERTIFICATE_PASSWORD` it tells you. `release.yml` loads it with `scripts/import-mac-signing-cert.sh`. Back up the `.p12`: a new certificate means everyone allows Axiom once more. It's free, but doesn't remove the "unidentified developer" warning; Apple's paid Developer ID (with notarisation) does both.

**The signing key.** The private key is a repository secret, `TAURI_SIGNING_PRIVATE_KEY`, generated with `npx tauri signer generate`. Keep a backup somewhere safe: without it, no update can ever reach copies already installed, and users would have to reinstall by hand. Signing is only switched on for releases (`src-tauri/tauri.release.conf.json`), so `npm run tauri build` works without the key.

## Shortcuts

- `Ctrl+B`: toggle the sidebar
- `Ctrl+Shift+X`: open Extensions
- `Ctrl+K` then `Ctrl+T`: open Themes
- `Ctrl+W`: close the current tab
