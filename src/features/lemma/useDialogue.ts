import { useCallback, useEffect, useRef, useState } from "react";
import { useDataChanged } from "../../lib/sync";
import { useAssistantAreas } from "../../shell/useAssistantAreas";
import { useAccount } from "../../shell/useAccount";
import { api as plan, type TodaySummary } from "../daily_plan/api";
import { nowMinute, today } from "../daily_plan/time";
import { createDialogueDirector, type CompletedAction, type DialogueEvent, type DialogueMessage } from "./dialogue";
import { hasFirstLight, lookForRole, useLook } from "./look";
import { useLemmaAreas } from "./parts";
import { nameOf, usePersona } from "./persona";
import { useCompanionPrefs } from "./preferences";
import { useLemma } from "./state";

type Surface = "desktop" | "overview" | "chat" | "preview" | "companion";
const director = createDialogueDirector();
// Only a timestamp is shared between windows. Remarks and task names are never stored.
const LAST_SPOKEN = "axiom.lemma.dialogueLastAt";
export function noteDialogueSpeech(at = Date.now()) {
  try { localStorage.setItem(LAST_SPOKEN, String(at)); } catch { /* Storage can be unavailable. */ }
}
function lastSpoken() {
  try { return Number(localStorage.getItem(LAST_SPOKEN)) || 0; } catch { return 0; }
}

function visible(node: HTMLElement | null) {
  if (!node?.isConnected || document.hidden || node.closest("[inert], [aria-hidden=true]") || !node.getClientRects().length) return false;
  const rect = node.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) return false;
  if (getComputedStyle(node).visibility === "hidden") return false;
  const x = Math.max(0, Math.min(innerWidth - 1, rect.x + rect.width / 2));
  const y = Math.max(0, Math.min(innerHeight - 1, rect.y + rect.height / 2));
  const top = document.elementFromPoint(x, y);
  return !!top && (node.contains(top) || (top !== document.body && top.contains(node)));
}

/** Local reactions shared by the supported views, not extra chat messages or AI calls. */
export function useDialogue(surface: Surface, enabled = true) {
  const persona = usePersona();
  const prefs = useCompanionPrefs();
  const lemma = useLemma();
  const chosen = useLook();
  const [account] = useAccount();
  const accountKey = account?.state === "signed_in" ? account.email : "local";
  const { areas: allowed } = useAssistantAreas();
  const available = useLemmaAreas();
  const admin = account?.state === "signed_in" && account.admin;
  const look = lookForRole(chosen, admin, hasFirstLight(account));
  const lookKey = JSON.stringify(look);
  const allowedKey = allowed.join(",");
  const availableKey = available.map(area => area.id).join(",");
  const canReadPlan = surface !== "preview" && prefs.chatter && allowed.includes("daily_plan") && available.some(area => area.id === "daily_plan");
  const [host, setHost] = useState<HTMLElement | null>(null);
  const attach = useCallback((node: HTMLElement | null) => setHost(node), []);
  const [message, setMessage] = useState<DialogueMessage | null>(null);
  const current = useRef({ persona, enabled, chatter: prefs.chatter, lemma, host, canReadPlan, accountKey });
  current.current = { persona, enabled, chatter: prefs.chatter, lemma, host, canReadPlan, accountKey };
  const messageOwner = useRef(accountKey);
  const silenceUntil = useRef(0);
  const absent = useRef(false);
  const pending = useRef<{ event: DialogueEvent; at: number } | null>(null);
  const reactionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const snapshot = useRef<{ day: string; owner: string; data: TodaySummary } | null>(null);
  const request = useRef(0);

  const canSpeak = useCallback(() => {
    const state = current.current;
    return state.chatter && state.enabled && state.lemma.activity === "idle" && !state.lemma.focused
      && !state.lemma.waiting && !state.lemma.feeling && Date.now() >= silenceUntil.current
      && !document.activeElement?.matches('textarea, input:not([type=checkbox]):not([type=radio]):not([type=range]), [contenteditable=true]')
      && (surface === "desktop" || !absent.current) && visible(state.host);
  }, [surface]);
  const offer = useCallback((event: DialogueEvent) => {
    if (!canSpeak()) return false;
    if ((event.kind === "returnTask" || event.kind === "dayDone") && !current.current.canReadPlan) return false;
    const next = director.offer(event, current.current.persona.personality, Date.now(), lastSpoken());
    if (!next) return false;
    noteDialogueSpeech(next.at);
    messageOwner.current = current.current.accountKey;
    setMessage(next);
    return true;
  }, [canSpeak]);
  const queueReaction = useCallback((event: DialogueEvent) => {
    pending.current = { event, at: Date.now() };
    window.clearTimeout(reactionTimer.current);
    const flush = () => {
      const waiting = pending.current;
      if (!waiting) return;
      if (Date.now() - waiting.at > 15_000 || !current.current.chatter) { pending.current = null; return; }
      if (!canSpeak()) { reactionTimer.current = setTimeout(flush, 700); return; }
      pending.current = null;
      offer(waiting.event);
    };
    reactionTimer.current = setTimeout(flush, 1800);
  }, [canSpeak, offer]);
  const completed = useCallback((kind: CompletedAction) => {
    if (surface === "preview") return;
    offer({ kind });
  }, [surface, offer]);

  // Coalesce a burst of wardrobe edits into a reaction to the final look or name.
  const previousAppearance = useRef({ name: nameOf(persona), look: lookKey });
  useEffect(() => {
    const before = previousAppearance.current;
    const name = nameOf(persona);
    previousAppearance.current = { name, look: lookKey };
    if (before.name !== name) queueReaction({ kind: "rename", values: { name }, key: "rename:" + name });
    else if (before.look !== lookKey) queueReaction({ kind: "outfit", key: "outfit:" + lookKey });
  }, [persona.name, lookKey, queueReaction]);

  useEffect(() => {
    let before = document.documentElement.dataset.theme;
    const observer = new MutationObserver(() => {
      const root = document.documentElement;
      if (!root.dataset.theme || root.dataset.theme === before) return;
      before = root.dataset.theme;
      const theme = root.dataset.themeName;
      if (theme) queueReaction({ kind: theme === "Crimson" ? "crimson" : "theme", values: { theme }, key: "theme:" + before });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [queueReaction]);

  const previousAllowed = useRef(allowedKey);
  useEffect(() => {
    const previous = previousAllowed.current.split(",").filter(Boolean);
    previousAllowed.current = allowedKey;
    if (surface === "preview" || previous.join(",") === allowedKey) return;
    setMessage(null);
    const on = available.filter(area => allowed.includes(area.id));
    const off = available.find(area => previous.includes(area.id) && !allowed.includes(area.id));
    const added = on.find(area => !previous.includes(area.id));
    if (!on.length) queueReaction({ kind: "noAccess", key: "access:none" });
    else if (off) queueReaction({ kind: "permissions", values: { enabled: on[0].name, disabled: off.name }, key: "permissions:" + off.id + ":" + allowedKey });
    else if (added) queueReaction({ kind: "access", values: { area: added.name }, key: "access:" + allowedKey });
  }, [allowedKey, availableKey, surface, queueReaction]);

  const loadPlan = useCallback(async () => {
    const token = ++request.current;
    if (!current.current.canReadPlan || !visible(current.current.host)) return null;
    const day = today();
    const owner = current.current.accountKey;
    try {
      const next = await plan.summary(day, nowMinute());
      if (token !== request.current || !current.current.canReadPlan || owner !== current.current.accountKey || day !== today()
        || !next || !Number.isFinite(next.total) || !Number.isFinite(next.done)) return null;
      const before = snapshot.current;
      snapshot.current = { day, owner, data: next };
      if (surface !== "desktop" && before?.day === day && before.owner === owner && before.data.done < before.data.total
        && next.total > 0 && next.done === next.total && next.done > before.data.done) {
        queueReaction({ kind: "dayDone", key: "dayDone:" + day });
      }
      return next;
    } catch { return null; }
  }, [surface, queueReaction]);
  useDataChanged(() => { void loadPlan(); });
  useEffect(() => {
    request.current++; snapshot.current = null; pending.current = null; setMessage(null);
  }, [accountKey]);
  useEffect(() => {
    if (!canReadPlan) { request.current++; snapshot.current = null; return; }
    void loadPlan();
    const every = setInterval(() => { void loadPlan(); }, 5 * 60_000);
    const observer = host ? new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void loadPlan(); }) : null;
    if (host) observer?.observe(host);
    return () => { request.current++; clearInterval(every); observer?.disconnect(); };
  }, [canReadPlan, host, loadPlan, accountKey]);

  useEffect(() => {
    let awayAt: number | null = null;
    let remembered: { id: string; day: string; owner: string } | null = null;
    const away = () => {
      if (awayAt !== null) return;
      awayAt = Date.now();
      absent.current = true;
      const first = current.current.canReadPlan && snapshot.current?.owner === current.current.accountKey
        ? snapshot.current.data.focus?.find(task => !task.doneAt) : null;
      remembered = first && snapshot.current ? { id: first.id, day: snapshot.current.day, owner: snapshot.current.owner } : null;
      setMessage(null);
    };
    const returned = async () => {
      const since = awayAt;
      awayAt = null;
      absent.current = false;
      if (since === null || Date.now() - since < 60_000 || surface === "preview") return;
      const task = remembered;
      remembered = null;
      const next = await loadPlan();
      const stillThere = task?.day === today() && task.owner === current.current.accountKey && current.current.canReadPlan
        ? next?.focus?.find(candidate => candidate.id === task.id && !candidate.doneAt) : null;
      offer(stillThere
        ? { kind: "returnTask", values: { task: stillThere.title }, key: "return:" + since }
        : { kind: "return", key: "return:" + since });
    };
    const visibility = () => document.hidden ? away() : void returned();
    const interact = (event: Event) => {
      setMessage(null);
      if (event instanceof KeyboardEvent) silenceUntil.current = Date.now() + 4000;
    };
    window.addEventListener("blur", away);
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("keydown", interact);
    window.addEventListener("pointerdown", interact);
    return () => {
      window.clearTimeout(reactionTimer.current);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("keydown", interact);
      window.removeEventListener("pointerdown", interact);
    };
  }, [surface, loadPlan, offer]);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), Math.max(0, message.until - Date.now()));
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!prefs.chatter || !enabled || lemma.activity !== "idle" || lemma.focused || lemma.waiting) setMessage(null);
  }, [prefs.chatter, enabled, lemma.activity, lemma.focused, lemma.waiting]);

  return {
    attach, completed,
    message: message && messageOwner.current === accountKey && prefs.chatter && enabled && lemma.activity === "idle" && !lemma.focused && !lemma.waiting
      && (!message.private || canReadPlan) && message.until > Date.now() ? message : null,
  };
}
