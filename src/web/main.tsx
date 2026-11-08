// Axiom on the web starts here (vite.config.ts points the page at this file
// in `--mode web`); the desktop app starts at src/main.tsx. Same app, plus
// the phone layout, the runtime that stands in for Rust, and what lets it be
// installed as an app.
import React from "react";
import ReactDOM from "react-dom/client";
import "../styles/theme.css";
import "../styles/shell.css";
import "../styles/mobile.css";
import "./web.css";
import App from "../App";
import { setUpInstalledApp } from "./installed";
import { ready } from "./runtime";

document.documentElement.dataset.platform = "web";
setUpInstalledApp();

// Sign-in is checked before anything shows, so a signed-out visitor goes
// straight to the sign-in rather than seeing an empty workspace first.
ready.then(
  () => {
    document.getElementById("boot")?.remove();
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  },
  (error: unknown) => {
    // Couldn't open (offline before ever signing in here): say why, not "Opening…" forever.
    const boot = document.getElementById("boot");
    if (boot) boot.textContent = error instanceof Error ? error.message : "Axiom couldn't open. Check your connection and try again.";
  },
);
