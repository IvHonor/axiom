import { useEffect, useState, type FormEvent } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { keyStatus, PROVIDERS, setKey, type KeyStatus, type Provider } from "../lib/ai";
import type { ExtensionManifest } from "../extensions/types";
import { ErrorNote, useAction } from "./account/fields";
import { Switch } from "./ui/Switch";
import { useAssistantAreas } from "./useAssistantAreas";
import { useAssistantName } from "../features/lemma/persona";

/** Lemma's settings: which areas it may see, and the person's own AI keys. */
export function AssistantSettings({ areas }: { areas: ExtensionManifest[] }) {
  const { areas: allowed, setAllowed } = useAssistantAreas();
  const me = useAssistantName();
  return (
    <div className="assistant-settings">
      <section className="assistant-group">
        <h3 className="assistant-heading">What {me} can see</h3>
        <p className="field-hint">
          Only the areas you switch on are sent to the AI (Google Gemini, or Groq when Gemini is busy), and only when you ask something. On Axiom&apos;s keys,
          what&apos;s sent isn&apos;t used to train AI models; with your own free key, Google or Groq may use it to improve theirs. Lemma only writes in Journal and
          Notes when you ask, and only ever adds to them.
        </p>
        <ul className="assistant-areas">
          {areas.map((ext) => (
            <li key={ext.id}>
              <span className="assistant-area-name">
                {ext.name}
                {ext.id === "journal" && (
                  <small className="field-hint">
                    Entries can include sensitive things, like your health. Switching this on is your consent for {me} to send what it reads in them to the AI.
                  </small>
                )}
              </span>
              <Switch on={allowed.includes(ext.id)} onChange={(on) => setAllowed(ext.id, on)} label={`Let ${me} use ${ext.name}`} />
            </li>
          ))}
        </ul>
      </section>
      <section className="assistant-group">
        <h3 className="assistant-heading">Your own AI keys</h3>
        <OwnKeys />
      </section>
    </div>
  );
}

function OwnKeys() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  useEffect(() => void keyStatus().then(setStatus, () => {}), []);
  const me = useAssistantName();
  return (
    <div className="assistant-group">
      <p className="field-hint">
        Optional. {me} runs on Axiom&apos;s free AI keys, which everyone shares with a daily limit. Add your own free key for your own allowance, or to use it
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
