import { useEffect, useState, type FormEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { chat, keyStatus, PROVIDERS, setKey, type AssistantReply, type KeyStatus, type Provider } from "../lib/ai";
import type { ExtensionManifest } from "../extensions/types";
import { ErrorNote, useAction } from "./account/fields";
import { Section } from "./ui/Section";
import { Switch } from "./ui/Switch";
import { useAssistantAreas } from "./useAssistantAreas";

const SYSTEM = "You are Axiom's assistant, inside Axiom, a desktop app for tracking every area of someone's life. Be brief and friendly.";

/** Sidebar for the assistant: what it may see, the person's own AI keys, and a quick check that it answers. */
export function AssistantPanel({ areas }: { areas: ExtensionManifest[] }) {
  const { areas: allowed, setAllowed } = useAssistantAreas();
  return (
    <aside className="sidebar">
      <header className="sidebar-head">Assistant</header>
      <div className="sidebar-body">
        <p className="field-hint assistant-intro">
          Ask Axiom&apos;s assistant to plan your day, add birthdays and more. It shows you every change before it makes it.
        </p>
        <Section title="What it can see">
          <div className="assistant-group">
            <p className="field-hint">
              Only the areas you switch on are sent to the AI (Google Gemini, or Groq when Gemini is busy), and only when you ask something. Free AI services may
              use what they&apos;re sent to improve their models.
            </p>
            <ul className="assistant-areas">
              {areas.map((ext) => (
                <li key={ext.id}>
                  <span>{ext.name}</span>
                  <Switch on={allowed.includes(ext.id)} onChange={(on) => setAllowed(ext.id, on)} label={`Let the assistant use ${ext.name}`} />
                </li>
              ))}
            </ul>
          </div>
        </Section>
        <Section title="Your own AI keys">
          <OwnKeys />
        </Section>
        <Section title="Try it">
          <TryIt />
        </Section>
      </div>
    </aside>
  );
}

function OwnKeys() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  useEffect(() => void keyStatus().then(setStatus, () => {}), []);
  return (
    <div className="assistant-group">
      <p className="field-hint">
        Optional. The assistant runs on Axiom&apos;s free AI keys, which everyone shares with a daily limit. Add your own free key for your own allowance, or to use it
        without an account. Keys stay in this computer&apos;s credential store.
      </p>
      {status && PROVIDERS.map((p) => <KeyRow key={p.id} provider={p.id} name={p.name} keyUrl={p.keyUrl} saved={status[p.id]} onChange={setStatus} />)}
    </div>
  );
}

function KeyRow({ provider, name, keyUrl, saved, onChange }: { provider: Provider; name: string; keyUrl: string; saved: boolean; onChange: (s: KeyStatus) => void }) {
  const [value, setValue] = useState("");
  const { busy, error, run } = useAction();
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const status = await run(() => setKey(provider, value));
    if (status) {
      onChange(status);
      setValue("");
    }
  };
  const remove = async () => {
    const status = await run(() => setKey(provider, null));
    if (status) onChange(status);
  };

  return (
    <form className="assistant-key" onSubmit={save} noValidate>
      <span className="field-label">{name}</span>
      {saved ? (
        <div className="row">
          <span className="assistant-saved">Key saved</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void remove()} disabled={busy}>
            Remove
          </button>
        </div>
      ) : (
        <>
          <div className="row">
            <input className="field-input" type="password" autoComplete="off" spellCheck={false} placeholder="Paste your key" aria-label={`${name} key`} value={value}
              disabled={busy} onChange={(e) => setValue(e.currentTarget.value)} />
            <button className="btn btn-sm" type="submit" disabled={busy || !value.trim()}>
              Save
            </button>
          </div>
          <button type="button" className="link assistant-get-key" onClick={() => void openUrl(keyUrl)}>
            Get a free {name} key
          </button>
        </>
      )}
      <ErrorNote error={error} />
    </form>
  );
}

function TryIt() {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const { busy, error, run } = useAction();
  const ask = async (e: FormEvent) => {
    e.preventDefault();
    setReply(null);
    const answer = await run(() => chat({ system: SYSTEM, messages: [{ role: "user", text: question.trim() }], tools: [] }));
    if (answer) setReply(answer);
  };

  return (
    <form className="assistant-group" onSubmit={ask} noValidate>
      <p className="field-hint">Check the assistant answers. It can&apos;t see your data here.</p>
      <div className="row">
        <input className="field-input" value={question} placeholder="Say hello" aria-label="Message" disabled={busy} onChange={(e) => setQuestion(e.currentTarget.value)} />
        <button className="btn btn-sm" type="submit" disabled={busy || !question.trim()}>
          {busy ? "Asking…" : "Ask"}
        </button>
      </div>
      <ErrorNote error={error} />
      {reply && (
        <div className="assistant-reply">
          <p>{reply.text}</p>
          <span className="field-hint">
            {reply.provider}, on {reply.ownKey ? "your key" : "Axiom's key"}
          </span>
        </div>
      )}
    </form>
  );
}
