import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAccount } from "@/lib/session";
import { Terminal } from "@/components/terminal/Terminal";

export const metadata: Metadata = { title: "Your terminal", description: "Your Axiom workspace in the browser.", robots: { index: false, follow: false } };

export default function TerminalPage() {
  return <Suspense fallback={<div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }} role="status">Opening your terminal…</div>}><Workspace /></Suspense>;
}
async function Workspace() {
  const account = await requireAccount("/terminal");
  // Access tokens stay on the server; the browser uses the existing httpOnly session.
  return <Terminal key={account.id} account={{ id: account.id, email: account.email, displayName: account.display_name }} />;
}
