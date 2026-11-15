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

**The Hub** (`src/features/playground/hub/`, `server/src/hub.rs`, types in `crates/protocol/src/hub.rs`) is the Playground's live, global space: people walk their AI between five rooms (Plaza, Library, Focus Lab, Garden Terrace, Arcade) and meet whoever's there. It's live only: entering puts you in the server's memory (no database work after that), the app checks in about once a second, and leaving, closing Axiom or 15 quiet seconds takes you out. People talk with fixed emotes and phrases (`EMOTES`, `PHRASES`), never free text, so nothing needs moderating; the server refuses anything else. While someone's in, anyone in the Hub can see their picture. `rooms.ts` holds each room's doors, furniture and spots, and walking (round furniture by the shortest path through its corners); `useHub.ts` the connection and movement; `scenes.tsx` what each room looks like.

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
- **macOS:** his window needs `macOSPrivateApi` (in `tauri.conf.json`, with Tauri's `macos-private-api` feature) to be see-through. That uses private macOS APIs, so Axiom can't go on the Mac App Store as it stands (it's distributed directly). On macOS, time away from the keyboard comes from `ioreg` and the chime from the system sounds; full-screen apps, calls and the window in front are only detected on Windows so far.
- **What it checks on the computer:** idle time, a full-screen app, another app using the microphone or camera, and the window in front (Windows). None of it leaves the computer. The weather, when turned on, sends a typed place, or coordinates rounded to about 10 km, to Open-Meteo.
- **Tests:** `node tests/desk.mjs` for him, `node tests/sidebar.mjs` for the sidebar (see `tests/README.md`).

## The Playground

Friends and leaderboards (`src/features/playground/`, `server/src/playground.rs`, types in `crates/protocol/src/playground.rs`). Accounts are end-to-end encrypted, so the server can't count anything: `playground_days` (`src-tauri/src/playground.rs`, with a `playground_days` in each feature's `analytics.rs`) reads how much of each metric happened on each day, `stats.ts` turns that into weeks, months, totals and streaks, and only the metrics the person shares are sent (`store.ts`, soon after launch, every ten minutes and after synced changes). The server checks each number against the metric's daily cap and ranks them; a metric someone stops sharing is deleted.

- **Metrics** live in `METRICS` (protocol) and `RULES` (`rules.ts`); keep the two in step. `global: false` ones (sizes people choose themselves, like tasks) only appear on friends' boards.
- **Friends** are for everyone signed in, not only Playground players: the friends button in the top bar (`src/shell/friends/FriendsButton.tsx`, sharing `FriendsPanel` with the Playground's sidebar) asks for a handle, nothing else. `in_playground` says who's on the boards; leaving them deletes the numbers but keeps the handle and friends. Friends are added by handle (they accept) or friend code (instant; making a new code retires the old one). Cheers are once per friend per UTC day.
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
