# Axiom

An open-source desktop life tracker built like VS Code: a minimal shell where each area of life (finance, university, daily plan, project board) is an extension.

Built with Tauri 2 (Rust) and React, TypeScript and Vite. Data lives in a local SQLite database (via SeaORM), so Axiom works offline and every action is instant. An optional account (served by `server/`, an Axum server on Postgres) syncs your data between computers in the background.

## Setup

1. Install [Rust](https://rustup.rs), [Node.js](https://nodejs.org) and, on Windows, the MSVC Build Tools.
2. `npm install`
3. `npm run tauri dev`

The database is created on first launch at `%APPDATA%\app.axiom.desktop\axiom.db` (Windows) or `~/Library/Application Support/app.axiom.desktop/axiom.db` (macOS). The status bar shows `Saved locally` once it's open.

### Accounts while developing

Development builds sign in against a server on your own computer:

1. Copy `server/.env.example` to `server/.env` and fill in `DATABASE_URL` (Neon) and `JWT_SECRET`.
2. `npm run server` in a second terminal (listens on `http://localhost:8787`).

The sign-in is kept in the operating system's credential store (Windows Credential Manager, macOS Keychain), never in a file.

Password reset codes are emailed through [Resend](https://resend.com). Without `RESEND_API_KEY` the server prints each email in its output instead, so "Forgot password?" works locally with no setup.

## Account features

The Account sidebar (the person icon, bottom left) has:

- **Sync:** status and a "Sync now" button.
- **Devices:** every computer signed in to the account, each of which can be signed out from here.
- **Password:** change it (other devices are signed out), or reset it with an emailed 8-character code from the sign-in screen. Codes last 30 minutes, allow 5 tries, and each address can request 3 an hour.
- **Your data:** export everything on this computer as JSON to Downloads (also available signed out).
- **Delete account:** needs the password and removes the account and everything synced to it from the server. The boards on the computer stay.

## How sync works

The local database is always the source of truth, so nothing waits on the network.

- **Tracking:** SQLite triggers note every changed row in `sync_outbox`, so features need no sync code. A feature lists its tables (see `SYNCED_TABLES` in `src-tauri/src/features/project_board/mod.rs`) and they sync.
- **Push:** a few seconds after an edit, only the fields that changed since the last sync are sent.
- **Merge:** the server stores each row as JSON and keeps the newest value per field, so two computers editing different fields of one task both keep their edit.
- **Pull:** at launch, every minute, after signing in and when the network comes back, the app fetches rows changed since it last pulled. A row with unsent local edits is skipped until those edits are pushed, so a pull never overwrites them.
- **Signing in** on a computer that already has projects asks whether to upload them to the account or replace them with the account's data. **Signing out** asks whether to keep the data on the computer.

## Deploying the server

The server is a plain Docker image (`server/Dockerfile`), so it runs on any container host. `render.yaml` sets it up on Render's free plan in Ohio, next to Neon's `us-east-2`:

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo, and paste Neon's connection string when asked for `DATABASE_URL`. Render generates `JWT_SECRET` itself. For reset emails, also fill in `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain you've verified in Resend; its free plan is plenty for reset codes).
3. Once it's live, open `https://<your-service>.onrender.com/health`; it should say `ok`.
4. Build the app with that address: `AXIOM_SERVER_URL=https://<your-service>.onrender.com npm run tauri build` (in PowerShell, set `$env:AXIOM_SERVER_URL` first). Release builds have no default server on purpose: without the variable, accounts are switched off rather than pointing at an address you don't control.

The free plan sleeps after 15 minutes without requests and takes about a minute to wake, so the first sign-in after a quiet spell is slow. The app waits for it and says so.

## Layout

| Path | What lives there |
| --- | --- |
| `src/shell/` | The app shell: top bar, activity bar, sidebars, status bar, overview |
| `src/extensions/` | The extension registry (`index.ts`) and the manifest and `Theme` types (`types.ts`) |
| `src/features/` | One folder per life-area feature (added as features are built) |
| `src/themes/` | One folder per theme extension: `modern_themes` (built in), `wireframe_themes`, `ember_themes` |
| `src/shell/theme/` | Applies the active theme as CSS variables |
| `src/lib/backend.ts` | Typed wrappers for every Tauri command React calls |
| `src-tauri/src/db/` | The database layer: opens the local SQLite file and runs migrations |
| `src-tauri/src/features/` | One Rust module per feature: entities, queries, commands |
| `src-tauri/src/system.rs` | Shell-level commands, such as `app_status` |
| `src-tauri/src/account/` | Signing in and out: talks to the server, keeps the sign-in in the credential store |
| `src-tauri/src/sync/` | Background sync: change-tracking triggers, push and pull, linking data to an account |
| `server/` | The account and sync server: Axum, SeaORM on Postgres, Argon2id passwords, JWT plus rotating refresh tokens |
| `crates/protocol/` | Request and response types shared by the app and the server |

## Commands

- `npm run tauri dev`: run the app while developing
- `npm run tauri build`: build the installable app
- `npm run server`: run the account server locally
- `cargo test --workspace`: run every Rust test (app, server and protocol)
- `cargo add <crate>` (inside `src-tauri`): add a Rust package

## Shortcuts

- `Ctrl+B`: toggle the sidebar
- `Ctrl+Shift+X`: open Extensions
- `Ctrl+K` then `Ctrl+T`: open Themes

## Making a theme

Copy `src/themes/modern_themes/index.ts` to a new folder, change the colors, fonts, `style` (corner radius, brackets, button style) and `labels`, then add the export to `EXTENSIONS` in `src/extensions/index.ts`. Every field is documented on the `Theme` type in `src/extensions/types.ts`. Give each theme extension a dark and a light theme so it works with "Match system light/dark".

## License

[MIT](LICENSE). Security issues: see [SECURITY.md](SECURITY.md).
