import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

/**
 * Axiom on the web is this same app, built with `--mode web`: every Tauri
 * import is swapped for a browser stand-in (src/web/tauri), whose `invoke`
 * answers the desktop's commands from the account's synced data. The build
 * lands in the website's public folder, which serves it at /terminal.
 */
const TAURI_SHIMS: [RegExp, string][] = [
  [/^@tauri-apps\/api\/core$/, "/src/web/tauri/core.ts"],
  [/^@tauri-apps\/api\/event$/, "/src/web/tauri/event.ts"],
  [/^@tauri-apps\/api\/window$/, "/src/web/tauri/window.ts"],
  [/^@tauri-apps\/plugin-opener$/, "/src/web/tauri/opener.ts"],
  [/^@tauri-apps\/plugin-process$/, "/src/web/tauri/process.ts"],
  [/^@tauri-apps\/plugin-updater$/, "/src/web/tauri/updater.ts"],
];

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  if (mode === "web") {
    return {
      plugins: [
        react(),
        {
          // The same index.html, started from src/web/main.tsx, ready for phones.
          name: "axiom-web-entry",
          transformIndexHtml: {
            order: "pre",
            handler: (html: string) => html
              .replace("/src/main.tsx", "/src/web/main.tsx")
              .replace(
                'content="width=device-width, initial-scale=1.0"',
                [
                  'content="width=device-width, initial-scale=1.0, viewport-fit=cover" />',
                  '<meta name="robots" content="noindex" />',
                  // Installable from the browser (site/public/manifest.webmanifest, sw.js).
                  '<meta name="theme-color" content="#f3f1ec" />',
                  '<link rel="manifest" href="/manifest.webmanifest" />',
                  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />',
                  '<meta name="mobile-web-app-capable" content="yes" />',
                  '<meta name="apple-mobile-web-app-capable" content="yes" />',
                  '<meta name="apple-mobile-web-app-title" content="Axiom" />',
                  '<meta name="apple-mobile-web-app-status-bar-style" content="default"',
                ].join("\n    "),
              )
              .replace('<div id="root"></div>', '<div id="boot" role="status">Opening Axiom…</div>\n    <div id="root"></div>'),
          },
        },
      ],
      base: "/app/",
      resolve: { alias: TAURI_SHIMS.map(([find, replacement]) => ({ find, replacement })) },
      // Every asset as a file: the website's CSP allows fonts only from itself, not data: URLs.
      build: { outDir: "site/public/app", emptyOutDir: true, chunkSizeWarningLimit: 4000, assetsInlineLimit: 0 },
      // `npm run dev:web`: sign in on the website (localhost:3000) first; the
      // cookie is shared across ports, and /api goes on to the website.
      server: {
        port: 1430,
        strictPort: true,
        proxy: { "/api": { target: "http://localhost:3000", changeOrigin: false } },
        watch: { ignored: ["**/src-tauri/**", "**/site/.next/**", "**/target/**"] },
      },
    };
  }
  return {
    plugins: [react()],

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
