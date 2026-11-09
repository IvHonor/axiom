# Security

## Reporting a vulnerability

Please don't open a public issue for security problems. Instead, use GitHub's private reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. You'll get a reply as soon as possible, and credit in the fix if you'd like it.

## How Axiom protects your data

- **Your data stays on your computer.** Everything is saved to a local database first. Nothing is sent anywhere unless you sign in to an account.
- **Passwords** are hashed with Argon2id on the server and never stored or logged in plain text. The app keeps only a sign-in token, in your operating system's credential store (Windows Credential Manager, macOS Keychain or Secret Service).
- **Sign-ins** use access tokens lasting six hours and rotating refresh tokens. Every authenticated request also checks that the session is still active. The same refresh repeated at once (or retried after a lost answer) gets the same new token, so a page renewing several requests together stays signed in; reuse outside those rules ends that session. Signing out, changing your password, or signing a device out invalidates its cached sessions.
- **Email confirmation** installs the mailbox owner's chosen credentials only after its code verifies. Anonymous repeat sign-ups cannot replace them. Older desktop versions must update before confirming a new account.
- **Browser sign-ins** keep access and refresh tokens in httpOnly cookies. A separate, random browser-session cookie binds offline workspace access to that sign-in. Signing out or switching accounts locks the previous workspace in open tabs and on offline reload. Cached records and unsent edits remain on the device; this binding does not encrypt browser storage.
- **Guessing is slowed down:** repeated wrong passwords lock an account for 15 minutes, requests are rate-limited per network, and password reset codes expire after 30 minutes and 5 wrong tries.
- **The app window is locked down** with a strict Content Security Policy, and links in your notes open in your browser rather than inside Axiom.
- **Deleting your account** removes it and everything synced to it from the server.

## Security regression checks

CI runs the backend security regressions and the website's account/security tests on pushes and pull requests. npm audits fail on moderate or higher advisories; Rust advisory exceptions are documented in `.cargo/audit.toml`.

```sh
cargo test -p axiom-server --locked
node --test tests/site-account-api.mjs tests/site-security.mjs tests/web-links.mjs
```

These checks cover account confirmation and reset-code replay (including wrong codes counting), concurrent session revocation and concurrent refreshes, sync limits and clock poisoning, cross-account requests, streamed request limits, offline access after sign-out, and which links the website will open.

## Running your own server

Keep `server/.env` private (it's ignored by git). It holds your database password and `JWT_SECRET`; anyone with the secret could sign in as any user. Generate the secret with `openssl rand -base64 48` and never reuse it between servers.
