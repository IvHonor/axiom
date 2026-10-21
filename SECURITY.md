# Security

## Reporting a vulnerability

Please don't open a public issue for security problems. Instead, use GitHub's private reporting: open the **Security** tab of this repository and choose **Report a vulnerability**. You'll get a reply as soon as possible, and credit in the fix if you'd like it.

## How Axiom protects your data

- **Your data stays on your computer.** Everything is saved to a local database first. Nothing is sent anywhere unless you sign in to an account.
- **Passwords** are hashed with Argon2id on the server and never stored or logged in plain text. The app keeps only a sign-in token, in your operating system's credential store (Windows Credential Manager, macOS Keychain or Secret Service).
- **Sign-ins** use short-lived access tokens (15 minutes) and single-use refresh tokens. Reusing an old refresh token ends that session on every copy, in case it was stolen. Signing out, changing your password, or signing a device out from another one ends those sessions straight away.
- **Guessing is slowed down:** repeated wrong passwords lock an account for 15 minutes, requests are rate-limited per network, and password reset codes expire after 30 minutes and 5 wrong tries.
- **The app window is locked down** with a strict Content Security Policy, and links in your notes open in your browser rather than inside Axiom.
- **Deleting your account** removes it and everything synced to it from the server.

## Running your own server

Keep `server/.env` private (it's ignored by git). It holds your database password and `JWT_SECRET`; anyone with the secret could sign in as any user. Generate the secret with `openssl rand -base64 48` and never reuse it between servers.
