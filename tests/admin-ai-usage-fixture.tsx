import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { EXTENSIONS } from "../src/extensions";
import { ThemeProvider } from "../src/shell/theme/ThemeProvider";
import { AdminAiUsage } from "../src/shell/views/AdminAiUsage";
import type { AdminAiUsage as Usage, AiUsageDay } from "../src/lib/account";
import "../src/styles/theme.css";
import "../src/styles/shell.css";

// ?empty: nobody has used Lemma yet.
const empty = new URLSearchParams(location.search).has("empty");

function day(daysAgo: number, prompts: number, failures = 0): AiUsageDay {
  const d = new Date(Date.UTC(2026, 10, 6) - daysAgo * 86_400_000).toISOString().slice(0, 10);
  return { day: d, prompts, calls: prompts * 3, input_tokens: prompts * 4200, cached_tokens: prompts * 1500, output_tokens: prompts * 380, transcriptions: Math.floor(prompts / 4), failures };
}

function usage(days: number): Usage {
  const daily = Array.from({ length: days }, (_, i) => (empty ? day(days - 1 - i, 0) : day(days - 1 - i, (i * 7) % 23 + (i % 5 === 0 ? 0 : 4), i % 9 === 0 ? 2 : 0)));
  const person = (id: string, email: string, name: string | null, share: number, error: string | null) => {
    const mine = daily.filter((_, i) => (i + id.length) % 3 !== 0).map((d) => ({ ...d, prompts: Math.round(d.prompts * share), input_tokens: Math.round(d.input_tokens * share), cached_tokens: Math.round(d.cached_tokens * share), output_tokens: Math.round(d.output_tokens * share), calls: Math.round(d.calls * share), failures: error ? d.failures : 0 }));
    const sum = (k: keyof Omit<AiUsageDay, "day">) => mine.reduce((n, d) => n + d[k], 0);
    return {
      id, email, display_name: name, daily: mine, last_error: error, last_used_at: "2026-11-06T09:30:00Z",
      prompts: sum("prompts"), calls: sum("calls"), input_tokens: sum("input_tokens"), cached_tokens: sum("cached_tokens"), output_tokens: sum("output_tokens"), transcriptions: sum("transcriptions"), failures: sum("failures"),
    };
  };
  const people = empty ? [] : [
    person("a1", "ada@example.com", "Ada Lovelace", 0.6, null),
    person("b22", "bob@example.com", null, 0.3, "The assistant couldn't answer: Groq is busy right now. Try again in a moment."),
    person("c333", "cy@example.com", "Cy", 0.1, null),
  ];
  return { days, daily, people, daily_limit: null };
}

mockWindows("main");
mockIPC((command, args) => {
  if (command === "account_admin_ai_usage") return usage((args as { days: number }).days);
  return null;
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider installed={EXTENSIONS}>
      <div className="page admin" style={{ padding: 20 }}>
        <AdminAiUsage />
      </div>
    </ThemeProvider>
  </StrictMode>,
);
