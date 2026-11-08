# Axiom's website

The site at axiomterminal.app: what Axiom is, the download, support, and the
privacy notice and terms. Built with Next.js (App Router, Cache Components)
and React. Prisma is set up for Axiom on the web, which is coming soon; the
site itself doesn't use a database, so it deploys without one.

## Run it

```sh
npm install
npm run dev        # http://localhost:3000
npm run build      # what Vercel runs
```

## The homepage tour

`src/components/home/AppWindow.tsx` rebuilds Axiom's window in HTML, in the
app's default theme (and the theme packs it flicks through), so it stays sharp
at any size. `WorkspaceTour.tsx` drives it with GSAP ScrollTrigger from native
scrolling: the window tilts, comes apart into its layers, reassembles, moves
through its tabs, then through themes. The header steps aside while it plays.
Visitors can skip it, or turn it off (remembered in their browser). Reduced
motion and very short screens get the plain window with working tabs.

## Web terminal (early development)

`/terminal` runs the desktop app's own React frontend, built for the browser.
It uses the desktop sync protocol through an account-bound same-origin proxy,
with a per-account IndexedDB cache and durable outbox. Custom AI names, looks,
held items and saved outfits use the same synced profile settings as the desktop.
First Light eligibility uses the account server's original creation date. See
[`docs/WEB_TERMINAL.md`](../docs/WEB_TERMINAL.md) for the parity checklist,
architecture and local browser test. This is separate from the public `/web`
preview and has not been deployed.

Run `npm ci` at the repository root as well as in `site`. The site's `prebuild`
runs `npm run build:web` from the repository root into `site/public/app`, so
every site build includes the current shared components, item descriptions,
models and animations. For local `next dev`, run that web build first and
repeat it after editing shared app source.

## Accounts

Sign-in, the waiting list and the account pages use the account server, the
same one the app uses. The browser turns the password into the app's login
key (`src/lib/login-key.ts`), so the password never leaves the device. Server
Actions call the server and keep the sign-in in two httpOnly cookies;
`src/proxy.ts` renews it. Changing or resetting a password stays in the app,
because the password also locks the encryption key.

## Test

Run `node tests/site-marketing.mjs` from the repository root against a
production build on port 3000 (`npm run build && npx next start`). Set
`PLAYWRIGHT_MODULE` to the file URL of an external Playwright installation
when needed; `SITE_TEST_URL` changes the address. Screenshots go to
`.qa.local/site`.

After a website production build, `node tests/lemma-web-sync.mjs` checks the
customisation UI, First Light cutoff, animations, and two-way sync of the name,
selected holdable and saved outfits across isolated devices. It starts its own
local website and fictional account server; it never uses a live account.

## Deploy (Vercel)

- Import the repository and set **Root Directory** to `site`.
- Keep **Include source files outside of the Root Directory in the Build Step**
  enabled, as required for the [shared desktop source](https://vercel.com/docs/monorepos/monorepo-faq#can-i-share-source-files-between-projects-are-shared-packages-supported).
  `vercel.json` installs both lockfiles so the shared components and fonts are available.
- Environment variables (the same values as the account server's):
  - `CONTACT_EMAIL`: shown on the privacy, terms and support pages.
  - `OPERATOR_NAME`: who runs Axiom, named in the privacy notice and terms.
  - `SITE_URL`: e.g. `https://axiomterminal.app`, for links in previews.
  - `AXIOM_API_URL`: the account server, e.g. `https://axiom-server-1bil.onrender.com`.
    Set it for Production (and Preview when testing previews), then redeploy.
    Production account requests and session refresh reject a missing/invalid URL;
    only development defaults to `http://localhost:8787`. Safe diagnostic logs
    use the `[axiom-api]` prefix and exclude credentials and response bodies.
  - `AXIOM_WEB_PROXY_SECRET`: the server's `WEB_PROXY_SECRET`. Without it,
    every website visitor shares one rate limit, and sign-in soon stops working.
    It trusts the visitor address Vercel gives (`x-real-ip`), so keep the site on Vercel
    or check that header on another host.
- Point the domain at Vercel in Cloudflare's DNS.

## How the download button stays current

`src/lib/release.ts` reads the newest release's `latest.json`, the file the
app's own updater uses, and caches it for a few minutes. New releases show up
on the site by themselves.

## Keep in step with the app

- The privacy notice and terms are also served by the account server
  (`server/src/privacy.rs`): change both together.
- Screenshots in `public/screenshots` are copies of `docs/screenshots`.
