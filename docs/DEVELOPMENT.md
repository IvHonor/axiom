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

## Releasing

The app's version lives in `package.json` (`tauri.conf.json` reads it from there). To publish one:

```
npm version 0.3.0        # or: npm version patch / minor
git push --follow-tags
```

`npm version` updates the version and makes a commit and a `v0.3.0` tag. Pushing the tag runs `.github/workflows/release.yml`, which builds the Windows installers, signs them for the updater, and publishes a GitHub Release with `latest.json`. Edit the release's notes on GitHub afterwards: installed copies show them in the update prompt.

Installed copies check `releases/latest/download/latest.json` about ten seconds after launch and every six hours, or when the version in the status bar is clicked. They only install updates signed with the key whose public half is in `plugins.updater.pubkey` in `tauri.conf.json`.

**The signing key.** The private key is a repository secret, `TAURI_SIGNING_PRIVATE_KEY`, generated with `npx tauri signer generate`. Keep a backup somewhere safe: without it, no update can ever reach copies already installed, and users would have to reinstall by hand. Signing is only switched on for releases (`src-tauri/tauri.release.conf.json`), so `npm run tauri build` works without the key.

## Shortcuts

- `Ctrl+B`: toggle the sidebar
- `Ctrl+Shift+X`: open Extensions
- `Ctrl+K` then `Ctrl+T`: open Themes
- `Ctrl+W`: close the current tab
