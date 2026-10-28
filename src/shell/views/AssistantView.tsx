import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { ArrowUp, Check, CheckCheck, ChevronUp, CornerLeftUp, Eye, Loader2, MessageSquarePlus, Mic, Palette, RotateCcw, Settings2, Square, Trash2, Undo2, Volume2, VolumeX } from "lucide-react";
import {
  chats as listChats,
  confirmAll,
  confirmChange,
  deleteChat,
  discardChange,
  getChat,
  send,
  stopTurn,
  transcribe,
  undoChange,
  type ChatSummary,
  type ChatView,
  type Entry,
  type Progress,
} from "../../lib/ai";
import { useTauriEvent } from "../../lib/sync";
import { microphones, record, speak, stopSpeaking, type Microphone, type Recording } from "../../lib/voice";
import { findExtension } from "../../extensions";
import { nudgeCalendars } from "../../features/daily_plan/api";
import { today } from "../../features/daily_plan/time";
import type { ExtensionManifest } from "../../extensions/types";
import { AssistantSettings } from "../AssistantSettings";
import { ago } from "../format";
import { useAssistantAreas } from "../useAssistantAreas";
import { usePersistentState } from "../usePersistentState";
import { Face, moodOf } from "../../features/lemma/Face";
import { feel, setLemma, useLemma } from "../../features/lemma/state";
import { doing, toolOf } from "../../features/lemma/parts";
import { Customise } from "../../features/lemma/Customise";
import { nameOf, useAssistantName, usePersona } from "../../features/lemma/persona";
import { ConfirmButton } from "../ui/ConfirmButton";
import { Dropdown } from "../ui/Dropdown";
import { ExtensionIcon } from "../ui/ExtensionIcon";
import { Modal } from "../ui/Modal";
import "./assistant.css";

/** Ideas to start with, for the areas Lemma may use. */
const SUGGESTIONS: [string, string][] = [
  ["daily_plan", "Plan my day"],
  ["birthdays", "Whose birthday is next?"],
  ["goals", "How are my goals going?"],
  ["reading", "What should I read next?"],
  ["finance", "What have I spent most on this month?"],
  ["uni", "Which lectures am I behind on?"],
  ["learning", "What should I study today?"],
  ["project_board", "What's left on my projects?"],
  ["journal", "How has my mood been lately?"],
];

/** The Assistant tab: chats with Lemma down the side, the conversation beside them. */
export function AssistantView({ areas, name }: { areas: ExtensionManifest[]; name: string | null }) {
  const { areas: allowed } = useAssistantAreas();
  const persona = usePersona();
  const [list, setList] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = usePersistentState<string | null>("axiom.assistant.chat", (saved) => (typeof saved === "string" ? saved : null));
  const [chat, setChat] = useState<ChatView | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  /** What each of this turn's answers has written so far, by step. */
  const [drafts, setDrafts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [customising, setCustomising] = useState(false);
  const [aloud, setAloud] = usePersistentState<boolean>("axiom.assistant.aloud", (saved) => saved === true);
  const [stopped, setStopped] = useState(false);
  const turn = useRef<string | null>(null);
  const busyRef = useRef(false);
  busyRef.current = busy;

  const refreshList = () => listChats().then(setList, () => {});
  useEffect(() => void refreshList(), []);
  useEffect(() => {
    setError(null);
    if (!chatId) return setChat(null);
    // A load that's no longer wanted (another chat was picked, or a new one
    // started) mustn't land over it.
    let wanted = true;
    getChat(chatId).then(
      (loaded) => wanted && setChat(loaded),
      () => wanted && setChatId(null),
    );
    return () => {
      wanted = false;
    };
  }, [chatId]);

  useTauriEvent<Progress>("assistant-progress", (p) => {
    if (!busyRef.current || p.state === "done") return;
    setProgress(p);
    const text = p.text;
    if (text !== null) {
      setDrafts((written) => Array.from({ length: Math.max(written.length, p.step + 1) }, (_, step) => (step === p.step ? text : (written[step] ?? ""))));
    }
  });

  const ask = async (text: string | null, into: string | null = chatId) => {
    stopSpeaking();
    const id = crypto.randomUUID();
    turn.current = id;
    setBusy(true);
    setAsking(text);
    setDrafts([]);
    setError(null);
    setStopped(false);
    try {
      const view = await send(id, into, text, allowed, name, persona);
      setChat(view);
      setChatId(view.id);
      const reply = view.entries[view.entries.length - 1];
      if (reply?.kind === "assistant" && turn.current === id) {
        feel("happy");
        if (aloud) speak(reply.text);
      }
    } catch (e) {
      setError(String(e));
      feel("concerned");
      // A new chat is kept even when Lemma couldn't answer, so it can be tried again.
      if (!into) {
        const fresh = await listChats().catch(() => []);
        if (fresh[0]) setChatId(fresh[0].id);
      } else {
        getChat(into).then(setChat, () => {});
      }
    } finally {
      turn.current = null;
      setBusy(false);
      setAsking(null);
      setProgress(null);
      setDrafts([]);
      void refreshList();
    }
  };

  /** Stops Lemma part-way: what it had done stays, and nothing more happens. */
  const stop = () => {
    if (!turn.current) return;
    void stopTurn(turn.current);
    turn.current = null;
    setStopped(true);
    stopSpeaking();
  };

  const lemma = useLemma();

  // Changes waiting for you: Lemma raises an eyebrow until they're dealt with.
  const waiting = chat?.entries.filter((e) => e.kind === "proposal" && e.status === "pending").length ?? 0;
  useEffect(() => {
    setLemma({ waiting });
    return () => setLemma({ waiting: 0 });
  }, [waiting]);

  const areaOf = (id: string) => areas.find((a) => a.id === id) ?? findExtension(id);
  const startNew = () => {
    setChatId(null);
    setChat(null);
    setError(null);
  };

  return (
    <div className="lemma-view">
      <aside className="lemma-chats" aria-label="Chats">
        <div className="lemma-chat-companion">
          <Face mood={moodOf(lemma)} size={200} level={lemma.level} tool={toolOf(lemma)} interactive />
          <p aria-live="polite">{doing(lemma) ?? "Here with you. Ready when you are."}</p>
          <button className="btn btn-sm btn-ghost" onClick={() => setCustomising(true)}><Palette size={12} /> Customise {nameOf(persona)}</button>
        </div>
        <button className="btn btn-sm lemma-new" onClick={startNew} disabled={busy}>
          <MessageSquarePlus size={14} strokeWidth={1.75} /> New chat
        </button>
        <ul>
          {list.map((c) => (
            <li key={c.id} className={c.id === chatId ? "is-active" : undefined}>
              <button className="lemma-chat-link" onClick={() => setChatId(c.id)} disabled={busy}>
                <span className="lemma-chat-title">{c.title}</span>
                <span className="lemma-chat-when">{ago(c.updatedAt)}</span>
              </button>
              <ConfirmButton
                className="icon-btn lemma-chat-delete"
                confirmText="Delete"
                onConfirm={async () => {
                  await deleteChat(c.id);
                  if (c.id === chatId) startNew();
                  void refreshList();
                }}
              >
                <Trash2 size={13} strokeWidth={1.75} aria-label="Delete chat" />
              </ConfirmButton>
            </li>
          ))}
        </ul>
      </aside>

      <section className="lemma-main">
        <header className="lemma-head">
          <Face mood={moodOf(lemma)} size={34} level={lemma.level} alive={false} />
          <h2>{chat?.title ?? nameOf(persona)}</h2>
          <button
            className={`icon-btn${aloud ? " is-on" : ""}`}
            onClick={() => {
              if (aloud) stopSpeaking();
              setAloud(!aloud);
            }}
            title={aloud ? "Stop reading replies aloud" : "Read replies aloud"}
            aria-label="Read replies aloud"
            aria-pressed={aloud}
          >
            {aloud ? <Volume2 size={15} strokeWidth={1.75} /> : <VolumeX size={15} strokeWidth={1.75} />}
          </button>
          <button className="icon-btn" onClick={() => setSettings(true)} title={`${nameOf(persona)}'s settings`} aria-label={`${nameOf(persona)}'s settings`}>
            <Settings2 size={15} strokeWidth={1.75} />
          </button>
        </header>

        <Thread
          chat={chat}
          asking={asking}
          drafts={drafts}
          busy={busy}
          progress={progress}
          error={error}
          name={name}
          allowed={allowed}
          areaOf={areaOf}
          onSuggest={(text) => void ask(text)}
          onRetry={() => void ask(null)}
          onOpenSettings={() => setSettings(true)}
          onChanged={setChat}
          stopped={stopped && !busy}
        />

        <Composer busy={busy} onSend={(text) => void ask(text)} onStop={stop} onListening={stopSpeaking} />
      </section>

      {settings && (
        <Modal title={`${nameOf(persona)}'s settings`} icon={<Settings2 size={16} strokeWidth={1.75} />} onClose={() => setSettings(false)} width={520}>
          <AssistantSettings areas={areas} />
        </Modal>
      )}
      {customising && <Customise onClose={() => setCustomising(false)} />}
    </div>
  );
}

interface ThreadProps {
  chat: ChatView | null;
  asking: string | null;
  /** Lemma's words so far this turn, as they're written. */
  drafts: string[];
  busy: boolean;
  progress: Progress | null;
  error: string | null;
  name: string | null;
  allowed: string[];
  areaOf: (id: string) => ExtensionManifest | undefined;
  onSuggest: (text: string) => void;
  onRetry: () => void;
  onOpenSettings: () => void;
  onChanged: (chat: ChatView) => void;
  /** The person stopped the last turn. */
  stopped: boolean;
}

function Thread({ chat, asking, drafts, busy, progress, error, name, allowed, areaOf, onSuggest, onRetry, onOpenSettings, onChanged, stopped }: ThreadProps) {
  const me = useAssistantName();
  const end = useRef<HTMLDivElement>(null);
  const count = (chat?.entries.length ?? 0) + (asking ? 1 : 0);
  const written = drafts.join("").length;
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count, busy, error, written]);

  const empty = !chat && !asking;
  const waiting = chat?.entries.filter((e) => e.kind === "proposal" && e.status === "pending") ?? [];
  // While words are arriving, they say what Lemma's doing.
  const writing = !!progress?.text?.trim();
  return (
    <div className="lemma-thread">
      {empty && <Welcome name={name} allowed={allowed} onSuggest={onSuggest} onOpenSettings={onOpenSettings} />}
      {chat?.entries.map((entry) => <EntryView key={entry.id} entry={entry} areaOf={areaOf} onChanged={onChanged} />)}
      {chat && waiting.length > 1 && !busy && <ConfirmAll chat={chat} count={waiting.length} onChanged={onChanged} />}
      {asking && <div className="lemma-bubble is-user">{asking}</div>}
      {busy &&
        drafts.map((text, step) =>
          text.trim() ? (
            <div key={`draft-${step}`} className="lemma-bubble is-lemma">
              <Rich text={text} />
            </div>
          ) : null,
        )}
      {busy && !writing && <Status progress={progress} areaOf={areaOf} />}
      {stopped && (
        <div className="lemma-stopped">
          <Square size={11} strokeWidth={2} /> You stopped {me}.
        </div>
      )}
      {error && !busy && (
        <div className="lemma-error" role="alert">
          <p>{error}</p>
          <button className="btn btn-sm btn-ghost" onClick={onRetry}>
            <RotateCcw size={13} strokeWidth={1.75} /> Try again
          </button>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}

function Welcome({ name, allowed, onSuggest, onOpenSettings }: { name: string | null; allowed: string[]; onSuggest: (text: string) => void; onOpenSettings: () => void }) {
  const me = useAssistantName();
  const ideas = SUGGESTIONS.filter(([area]) => allowed.includes(area)).slice(0, 4);
  return (
    <div className="lemma-welcome">
      <h3>{name ? `Hi ${name.split(" ")[0]}, I'm ${me}.` : `Hi, I'm ${me}.`}</h3>
      <p>Ask me to plan your day, keep track of birthdays, or anything about your areas. I&apos;ll show you every change before I make it.</p>
      {ideas.length > 0 ? (
        <div className="lemma-ideas">
          {ideas.map(([, text]) => (
            <button key={text} className="lemma-idea" onClick={() => onSuggest(text)}>
              {text}
            </button>
          ))}
        </div>
      ) : (
        <div className="lemma-callout">
          <p>I can&apos;t see any of your areas yet, so for now I can only chat.</p>
          <button className="btn btn-sm" onClick={onOpenSettings}>
            Choose what {me} can see
          </button>
        </div>
      )}
    </div>
  );
}

function Status({ progress, areaOf }: { progress: Progress | null; areaOf: (id: string) => ExtensionManifest | undefined }) {
  const me = useAssistantName();
  const area = progress?.area ? areaOf(progress.area)?.name ?? progress.area : null;
  const text = progress?.state === "looking" && area ? `Looking at ${area}…` : progress?.state === "preparing" && area ? `Preparing changes in ${area}…` : `${me} is thinking…`;
  return (
    <div className="lemma-status" aria-live="polite">
      <Loader2 size={14} strokeWidth={1.75} className="lemma-spin" /> {text}
    </div>
  );
}

function EntryView({ entry, areaOf, onChanged }: { entry: Entry; areaOf: (id: string) => ExtensionManifest | undefined; onChanged: (chat: ChatView) => void }) {
  switch (entry.kind) {
    case "user":
      return <div className="lemma-bubble is-user">{entry.text}</div>;
    case "assistant":
      return (
        <div className="lemma-bubble is-lemma" title={answeredBy(entry.provider, entry.tokens)}>
          <Rich text={entry.text} />
        </div>
      );
    case "looked": {
      const ext = areaOf(entry.area);
      return (
        <div className="lemma-looked">
          <Eye size={12} strokeWidth={1.75} /> Looked at {ext?.name ?? entry.area}
        </div>
      );
    }
    case "proposal":
      return <ProposalCard entry={entry} ext={areaOf(entry.area)} onChanged={onChanged} />;
    case "repeat":
      return (
        <button className="lemma-looked lemma-repeat" onClick={() => showCard(entry.proposal)}>
          <CornerLeftUp size={12} strokeWidth={1.75} /> Same change as the card above
        </button>
      );
  }
}

/** Scrolls to a change's card and makes it stand out for a moment. */
function showCard(id: string) {
  const card = document.getElementById(`lemma-card-${id}`);
  if (!card) return;
  card.scrollIntoView({ block: "center", behavior: "smooth" });
  card.classList.remove("is-shown");
  void card.offsetWidth;
  card.classList.add("is-shown");
}

/** Confirms every change waiting in the chat at once. */
function ConfirmAll({ chat, count, onChanged }: { chat: ChatView; count: number; onChanged: (chat: ChatView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    const plan = chat.entries.some((e) => e.kind === "proposal" && e.status === "pending" && e.area === "daily_plan");
    setBusy(true);
    setError(null);
    try {
      onChanged(await confirmAll(chat.id));
      // The plan goes out to the person's calendar, once edits settle.
      if (plan) nudgeCalendars(today());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="lemma-confirm-all">
      <span>{count} changes waiting for you</span>
      <button className="btn btn-sm" onClick={() => void confirm()} disabled={busy}>
        <CheckCheck size={13} strokeWidth={2} /> {busy ? "Saving…" : "Confirm all"}
      </button>
      {error && <span className="lemma-card-failed">{error}</span>}
    </div>
  );
}

/** "Gemini · 3,150 tokens", for a reply's tooltip. */
function answeredBy(provider: string | null, tokens: number | null): string | undefined {
  const parts = [provider, tokens ? `${tokens.toLocaleString()} tokens` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : undefined;
}

function ProposalCard({ entry, ext, onChanged }: { entry: Extract<Entry, { kind: "proposal" }>; ext: ExtensionManifest | undefined; onChanged: (chat: ChatView) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: (id: string) => Promise<ChatView>) => {
    setBusy(true);
    setError(null);
    try {
      onChanged(await action(entry.id));
      // The plan goes out to the person's calendar, once edits settle.
      if (entry.area === "daily_plan") nudgeCalendars(today());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`lemma-card is-${entry.status}`} id={`lemma-card-${entry.id}`}>
      <header>
        {ext && <ExtensionIcon ext={ext} size={14} />}
        <strong>{entry.preview.title}</strong>
      </header>
      <ul>
        {entry.preview.items.map((item, i) => (
          <li key={i}>
            <span className="lemma-card-label">{item.label}</span>
            <span className="lemma-card-value">
              {item.before !== undefined && <del>{item.before}</del>}
              {item.before !== undefined && item.after !== undefined && <span className="lemma-card-arrow">→</span>}
              {item.after !== undefined && <span>{item.after}</span>}
            </span>
          </li>
        ))}
      </ul>
      <footer>
        {entry.status === "pending" && (
          <>
            <button className="btn btn-sm" onClick={() => void act(confirmChange)} disabled={busy}>
              <Check size={13} strokeWidth={2} /> {busy ? "Saving…" : "Confirm"}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => void act(discardChange)} disabled={busy}>
              Discard
            </button>
          </>
        )}
        {entry.status === "confirmed" && (
          <>
            <span className="lemma-card-done">
              <Check size={13} strokeWidth={2} /> Done
            </span>
            {entry.undoable && (
              <button className="btn btn-sm btn-ghost" onClick={() => void act(undoChange)} disabled={busy}>
                <Undo2 size={13} strokeWidth={1.75} /> {busy ? "Undoing…" : "Undo"}
              </button>
            )}
            {!entry.undoable && entry.elsewhere && (
              <span className="lemma-card-note" title="What a change did is kept only on the computer where it was confirmed, so that's where it can be undone.">
                Undo is on the computer where you confirmed it
              </span>
            )}
          </>
        )}
        {entry.status === "undone" && <span className="lemma-card-note">Undone</span>}
        {entry.status === "discarded" && <span className="lemma-card-note">Discarded</span>}
        {entry.status === "failed" && <span className="lemma-card-failed">Couldn&apos;t do it: {entry.outcome}</span>}
        {entry.status === "failed" && entry.undoable && (
          <button className="btn btn-sm btn-ghost" onClick={() => void act(undoChange)} disabled={busy} title="Some of it was done before it failed">
            <Undo2 size={13} strokeWidth={1.75} /> {busy ? "Undoing…" : "Undo what was done"}
          </button>
        )}
        {error && <span className="lemma-card-failed">{error}</span>}
      </footer>
    </div>
  );
}

function Composer({ busy, onSend, onStop, onListening }: { busy: boolean; onSend: (text: string) => void; onStop: () => void; onListening: () => void }) {
  const [text, setText] = useState("");
  const me = useAssistantName();
  const box = useRef<HTMLTextAreaElement>(null);
  const [voice, setVoice] = useState<"idle" | "listening" | "writing">("idle");
  const [level, setLevel] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [mic, setMic] = usePersistentState<string | null>("axiom.assistant.mic", (saved) => (typeof saved === "string" ? saved : null));
  const recording = useRef<Recording | null>(null);
  const cancelled = useRef(false);

  // Click to talk: it stops by itself when you pause, and what you said goes
  // into the box to check (and change) before sending.
  const talk = async () => {
    if (voice === "listening") return recording.current?.stop();
    if (voice !== "idle" || busy) return;
    setNote(null);
    onListening();
    cancelled.current = false;
    try {
      const rec = await record((l) => {
        setLevel(l);
        setLemma({ level: l });
      }, mic ?? undefined);
      recording.current = rec;
      setVoice("listening");
      setLemma({ activity: "listening" });
      const audio = await rec.result;
      recording.current = null;
      setLemma({ activity: audio ? "thinking" : "idle", level: 0 });
      if (!audio) {
        if (!cancelled.current) setNote(`${me} didn't hear anything. Check the microphone chosen with the arrow beside the button, and that it isn't muted.`);
        return setVoice("idle");
      }
      setVoice("writing");
      const heard = await transcribe(audio.audio, audio.mime);
      if (heard.text) {
        setText((typed) => (typed.trim() ? `${typed.trimEnd()} ${heard.text}` : heard.text));
        box.current?.focus();
      } else {
        setNote(`${me} didn't catch that. Try again a little closer to the microphone.`);
      }
    } catch (e) {
      setNote(String(e).replace(/^Error: /, ""));
    } finally {
      recording.current = null;
      setVoice("idle");
      setLemma({ activity: "idle", level: 0 });
    }
  };
  useEffect(
    () => () => {
      recording.current?.cancel();
      setLemma({ activity: "idle", level: 0 });
    },
    [],
  );

  // Grows with what's typed, up to a few lines.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || !text.trim()) return;
    onSend(text.trim());
    setText("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
    if (e.key === "Escape" && voice === "listening") {
      cancelled.current = true;
      recording.current?.cancel();
    }
  };

  const listening = voice === "listening";
  return (
    <div className="lemma-compose">
      {note && <p className="lemma-voice-note">{note}</p>}
      <form className={`lemma-composer${listening ? " is-listening" : ""}`} onSubmit={submit}>
        <textarea
          ref={box}
          rows={1}
          value={text}
          placeholder={listening ? "Listening… pause when you're done" : voice === "writing" ? "Writing down what you said…" : `Ask ${me}…`}
          aria-label={`Message ${me}`}
          autoFocus
          readOnly={voice !== "idle"}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className={`lemma-mic${listening ? " is-on" : ""}`}
          style={{ "--level": level } as CSSProperties}
          onClick={() => void talk()}
          disabled={busy || voice === "writing"}
          title={listening ? "Stop listening" : `Talk to ${me}`}
          aria-label={listening ? "Stop listening" : `Talk to ${me}`}
          aria-pressed={listening}
        >
          {voice === "writing" ? <Loader2 size={16} strokeWidth={2} className="lemma-spin" /> : <Mic size={16} strokeWidth={2} />}
        </button>
        <div className="lemma-mic-choice">
          <Dropdown label="Choose a microphone" icon={<ChevronUp size={13} strokeWidth={2} />} up>
            {(close) => (
              <MicList
                chosen={mic}
                onChoose={(id) => {
                  setMic(id);
                  setNote(null);
                  close();
                }}
              />
            )}
          </Dropdown>
        </div>
        {busy ? (
          <button className="lemma-send is-stop" type="button" onClick={onStop} title={`Stop ${me}`} aria-label={`Stop ${me}`}>
            <Square size={12} strokeWidth={2.5} fill="currentColor" />
          </button>
        ) : (
          <button className="lemma-send" type="submit" disabled={!text.trim() || voice !== "idle"} aria-label="Send">
            <ArrowUp size={16} strokeWidth={2} />
          </button>
        )}
      </form>
    </div>
  );
}

/** The microphones to choose from, read when the menu opens (and when one's plugged in). */
function MicList({ chosen, onChoose }: { chosen: string | null; onChoose: (id: string | null) => void }) {
  const [mics, setMics] = useState<Microphone[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const load = () => microphones().then(setMics, (e) => setProblem(String(e).replace(/^Error: /, "")));
    void load();
    navigator.mediaDevices?.addEventListener("devicechange", load);
    return () => navigator.mediaDevices?.removeEventListener("devicechange", load);
  }, []);

  const item = (id: string | null, name: string) => (
    <button key={id ?? "default"} className="menu-item" role="menuitemradio" aria-checked={chosen === id} onClick={() => onChoose(id)}>
      <span className="lemma-mic-tick">{chosen === id && <Check size={13} strokeWidth={2} />}</span>
      {name}
    </button>
  );
  return (
    <div className="lemma-mic-list">
      <p className="menu-heading">Microphone</p>
      {problem && <p className="lemma-mic-problem">{problem}</p>}
      {!mics && !problem && <p className="lemma-mic-problem">Looking for microphones…</p>}
      {mics && item(null, "Computer's default")}
      {mics?.filter((m) => m.id !== "default" && m.id !== "communications").map((m) => item(m.id, m.name))}
      {mics?.length === 0 && <p className="lemma-mic-problem">No microphone is connected.</p>}
    </div>
  );
}

/** Lemma's words with light formatting: paragraphs, "- " lists and **bold**. */
function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((item, i) => <li key={i}>{bold(item)}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]);
      continue;
    }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{bold(line)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

/** **Bold** and *italic* (or _italic_), as Lemma writes them. */
function bold(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\b_[^_]+_\b)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if ((part.startsWith("*") && part.endsWith("*") && part.length > 2) || (part.startsWith("_") && part.endsWith("_") && part.length > 2)) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}
