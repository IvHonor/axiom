import { createRoot } from "react-dom/client";
import { EXTENSIONS } from "../src/extensions";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { WhatsNew } from "../src/shell/WhatsNew";
import { unseen } from "../src/shell/releaseNotes";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

// Which updates get the news, without the app.
(window as unknown as { cases: unknown }).cases = {
  fromOld: unseen("0.6.1", "0.6.2").length,
  sameVersion: unseen("0.6.2", "0.6.2").length,
  laterMinor: unseen("0.6.1", "0.7.0").length,
  alreadySeenLater: unseen("0.7.0", "0.7.1").length,
  fresh: unseen(null, "0.6.2").length,
};
const version = new URLSearchParams(location.search).get("version") ?? "0.6.2";
createRoot(document.getElementById("root")!).render(
  <ThemeProvider installed={EXTENSIONS}>
    <WhatsNew version={version} onOpenLemma={() => document.body.setAttribute("data-opened", "lemma")} />
  </ThemeProvider>,
);
