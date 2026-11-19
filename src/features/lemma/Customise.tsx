import { createPortal } from "react-dom";
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bookmark, Box, Check, Circle, CircleEllipsis, CircleSlash, Cog, Crown, Droplet, Droplets, Eye, Flame, Glasses, Headphones, Lock, MessageCircle, Palette, Play, Pyramid, RotateCcw, Sailboat, SlidersHorizontal, Spade, Sparkle, Sparkles, Square, Trash2, Volume2, Waves } from "lucide-react";
import { AviatorsIcon, BandanaIcon, BeadsIcon, BeanieIcon, BeretIcon, BowTieIcon, BucketHatIcon, CapIcon, CatEyeIcon, ChainIcon, CogBoloIcon, CollarIcon, DeerstalkerIcon, DragonHelmIcon, FedoraIcon, FlatCapIcon, GogglesIcon, HeadbandIcon, LanyardIcon, LoupeIcon, MaskIcon, RibbonIcon, RoundGlassesIcon, ScarfIcon, ScribeCapIcon, SunglassesIcon, SunHatIcon, TiedGlassesIcon, TieIcon, TopHatIcon } from "./wearIcons";
import { FACEWEAR_COLOURS, HEADWEAR_COLOURS, NECKWEAR_COLOURS } from "./everydayWear";
import { findExtension } from "../../extensions";
import { Modal, ModalHostContext } from "../../shell/ui/Modal";
import { Face, type Mood } from "./Face";
import { ACCESSORIES, FINISHES, GLOW_EFFECTS, GLOWS, HOLDINGS, SHAPES, SHELLS, STANDARD, hasFirstLight, lookForRewards, lookForRole, rewardFor, setLook, useLook, type Look } from "./look";
import { rewardSource, type Known } from "./achievements/catalog";
import { useSecrets } from "./achievements/secrets";
import { useAchievementRewards, useSharedCounts } from "./achievements/useAchievementRewards";
import { getDays } from "../playground/api";
import { DEFAULT_NAME, MAX_NAME, PERSONALITIES, nameOf, setPersona, usePersona, type Personality } from "./persona";
import { MAX_OUTFITS, setCompanionPrefs, useCompanionPrefs } from "./preferences";
import { speak, stopSpeaking } from "../../lib/voice";
import { Switch } from "../../shell/ui/Switch";
import { useDialogue } from "./useDialogue";
import { useAccount } from "../../shell/useAccount";
import { useLemma } from "./state";
import { routineFor } from "./itemIdle";
import "./customise.css";

const SAMPLES: Record<Personality, string> = {
  standard: "Let's start with one small task. What would you like to finish first?",
  cheerful: "Let's get a little momentum going! Pick one small task and we'll take it from there.",
  calm: "Take a breath. There is time to begin with one small, manageable step.",
  direct: "Choose your highest-priority task. Work on its first step for ten minutes.",
  witty: "The task probably won't do itself. I've asked. Let's give it ten minutes.",
  coach: "You've got a starting point: choose one task and commit to ten focused minutes. I'll help you keep moving.",
  automaton: "Task queue loaded. Select one item. Timer will run for ten minutes. Awaiting input.",
  muse: "Every page begins with one small line. Which task is quietly asking for you first?",
  jekyll: "By all means, let us begin with one small task, my friend. (Or burn the list.) Do forgive me. One small task.",
};

const TABS = [{ id: "Appearance", Icon: Palette }, { id: "Personality", Icon: MessageCircle }, { id: "Presence", Icon: SlidersHorizontal }, { id: "Outfits", Icon: Bookmark }];
const GROUPS = ["Body", "Wear", "Extras"];
const CORNERS = [{ id: "bottom-right", name: "Bottom right" }, { id: "bottom-left", name: "Bottom left" }, { id: "top-right", name: "Top right" }, { id: "top-left", name: "Top left" }] as const;
const FACEWEAR = [{ id: "none", name: "No facewear" }, { id: "glasses", name: "Glasses" }, { id: "sunglasses", name: "Sunglasses" }, { id: "loupe", name: "Loupe" }, { id: "griffin-goggles", name: "Griffin's goggles" }, { id: "three-realms", name: "Three Realms" }, { id: "round-glasses", name: "Round glasses" }, { id: "aviators", name: "Aviators" }, { id: "cat-eye", name: "Cat-eye glasses" }, { id: "tinted-glasses", name: "Tinted glasses" }] as const;
const NECKWEAR = [{ id: "none", name: "No neckwear" }, { id: "bow", name: "Bow tie" }, { id: "tie", name: "Tie" }, { id: "cog-bolo", name: "Cog bolo" }, { id: "ribbon-bookmark", name: "Ribbon" }, { id: "counts-collar", name: "Count's collar" }, { id: "scarf", name: "Scarf" }, { id: "bandana", name: "Bandana" }, { id: "chain-necklace", name: "Chain necklace" }, { id: "lanyard", name: "Lanyard" }, { id: "bead-necklace", name: "Bead necklace" }] as const;
const SHAPE_ICONS = { orb: Circle, prism: Box, pyramid: Pyramid, drop: Droplet };
const ACCESSORY_ICONS = { none: CircleSlash, headphones: Headphones, halo: CircleEllipsis, cap: CapIcon, beanie: BeanieIcon, crown: Crown, fedora: FedoraIcon, "gearwright-hat": TopHatIcon, "scribe-cap": ScribeCapIcon, deerstalker: DeerstalkerIcon, "dragon-helm": DragonHelmIcon, "bucket-hat": BucketHatIcon, beret: BeretIcon, "flat-cap": FlatCapIcon, headband: HeadbandIcon, "sun-hat": SunHatIcon };
const FACEWEAR_ICONS = { none: CircleSlash, glasses: Glasses, sunglasses: SunglassesIcon, loupe: LoupeIcon, "griffin-goggles": GogglesIcon, "three-realms": MaskIcon, "round-glasses": RoundGlassesIcon, aviators: AviatorsIcon, "cat-eye": CatEyeIcon, "tinted-glasses": TiedGlassesIcon };
const NECKWEAR_ICONS = { none: CircleSlash, bow: BowTieIcon, tie: TieIcon, "cog-bolo": CogBoloIcon, "ribbon-bookmark": RibbonIcon, "counts-collar": CollarIcon, scarf: ScarfIcon, bandana: BandanaIcon, "chain-necklace": ChainIcon, lanyard: LanyardIcon, "bead-necklace": BeadsIcon };
const GLOW_ICONS = { none: CircleSlash, motes: Sparkle, embers: Flame, fireflies: Sparkles, verdigris: Cog, "mood-ink": Droplets, "pack-of-cards": Spade };
const FINISH_ICONS: Partial<Record<Look["finish"], typeof Cog>> = { skeleton: Cog, "living-ink": Waves, voyage: Sailboat };
const NECKWEAR_COLOUR = { none: "#b83f55", bow: "#b83f55", tie: "#7a2e3a", "cog-bolo": "#a67c4b", "ribbon-bookmark": "#a3234a", "counts-collar": "#121117", ...NECKWEAR_COLOURS };
const NECKWEAR_LABELS: Partial<Record<Look["neckwear"], string>> = { tie: "Tie colour", "cog-bolo": "Cord colour", "ribbon-bookmark": "Ribbon colour", "counts-collar": "Collar colour", scarf: "Scarf colour", bandana: "Bandana colour", "chain-necklace": "Chain colour", lanyard: "Lanyard colour", "bead-necklace": "Bead colour" };
const FACEWEAR_COLOUR = { none: "#d7e1e5", glasses: "#d7e1e5", sunglasses: "#161b20", loupe: "#c79a4f", "griffin-goggles": "#c79a4f", "three-realms": "#d9ab50", ...FACEWEAR_COLOURS };
const headwearColour = (accessory: Look["accessory"]) => accessory in HEADWEAR_COLOURS ? HEADWEAR_COLOURS[accessory as keyof typeof HEADWEAR_COLOURS] : accessory === "crown" || accessory === "halo" ? "#ffd078" : accessory === "fedora" ? "#35343a" : accessory === "gearwright-hat" ? "#26252b" : accessory === "scribe-cap" ? "#3b2a58" : accessory === "deerstalker" ? "#ffffff" : accessory === "dragon-helm" ? "#dfb04a" : "#466b85";
const sameLook = (a: Look, b: Look) => (Object.keys(STANDARD) as (keyof Look)[]).every(key => a[key] === b[key]);

/** What the card beside an item says about it. */
interface ItemTip {
  name: string;
  status?: string;
  from?: string;
  achievement?: string;
  goal?: string;
  area?: string;
  progress?: { text: string; share: number };
  note?: string;
}
type Shown = { tip: ItemTip; box: DOMRect };
/** What every choice needs for its locked state and its hover card. */
interface Gate { locked: boolean; trying: boolean; tip?: ItemTip; description?: string; onTip: (shown: Shown | null) => void }

/** Lemma's wardrobe: how it looks, who it is, how it behaves and saved outfits, beside a live preview. */
export function Customise({ onClose }: { onClose: () => void }) {
  const chosen = useLook();
  const [account] = useAccount();
  const admin = account?.state === "signed_in" && account.admin;
  const firstLight = hasFirstLight(account);
  const rewards = useAchievementRewards();
  const shared = useSharedCounts();
  const secrets = useSecrets();
  const look = useMemo(() => lookForRewards(lookForRole(chosen, admin, firstLight), rewards), [chosen, admin, firstLight, rewards]);
  const persona = usePersona();
  const name = nameOf(persona);
  const prefs = useCompanionPrefs();
  const context = useLemma();
  const [days, setDays] = useState<Known["days"] | null>(null);
  useEffect(() => { let live = true; getDays().then(all => { if (live && all) setDays(all); }).catch(() => {}); return () => { live = false; }; }, []);

  const isLocked = (reward?: string) => !!reward && !rewards.includes(reward);
  // Locked items being tried on. They only ever reach the preview: nothing here is saved.
  const [tryingLook, setTryingLook] = useState<Partial<Look>>({});
  const [tryingPersonality, setTryingPersonality] = useState<Personality | null>(null);
  const trying = useMemo(() => Object.fromEntries(Object.entries(tryingLook).filter(([field, value]) => isLocked(rewardFor(field as keyof Look, String(value))))) as Partial<Look>, [tryingLook, rewards]);
  const triedPersonality = tryingPersonality && isLocked(PERSONALITIES.find(p => p.id === tryingPersonality)?.reward) ? tryingPersonality : null;
  const previewLook = useMemo(() => ({ ...look, ...trying }), [look, trying]);
  const shownPersonality = triedPersonality ?? persona.personality;
  const triedRewards = [
    ...Object.entries(trying).flatMap(([field, value]) => rewardFor(field as keyof Look, String(value)) ?? []),
    ...(triedPersonality ? [PERSONALITIES.find(p => p.id === triedPersonality)!.reward!] : []),
  ];
  const previewing = triedRewards.length > 0;
  const peer = useMemo(() => ({ personality: shownPersonality, name: persona.name, admin, firstLight }), [shownPersonality, persona.name, admin, firstLight]);
  const stopTrying = () => { setTryingLook({}); setTryingPersonality(null); };

  const [shownTip, setShownTip] = useState<Shown | null>(null);
  useEffect(() => {
    if (!shownTip) return;
    const hide = () => setShownTip(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [shownTip]);

  const rewardTip = (id: string): { tip: ItemTip; description: string } | undefined => {
    const source = rewardSource(id);
    if (!source) return undefined;
    const { achievement, reward } = source, target = reward.target, goal = achievement.goal(target);
    const area = achievement.area === "axiom" ? "Axiom" : findExtension(achievement.area)?.name ?? achievement.area;
    const earned = rewards.includes(id);
    const known = days ? achievement.count?.({ days, lookChanged: false, secrets }) : undefined;
    const count = Math.max(known ?? 0, shared[achievement.id] ?? 0);
    const show = (n: number) => achievement.format ? achievement.format(n) : n.toLocaleString("en-GB");
    return {
      tip: {
        name: reward.name, status: admin ? "Available to admins" : earned ? "Unlocked" : "Locked", from: reward.from, achievement: achievement.secret ? undefined : achievement.name, goal, area,
        progress: !earned && (known !== undefined || shared[achievement.id] !== undefined) ? { text: `${show(Math.min(count, target))} / ${show(target)}`, share: Math.min(1, count / target) } : undefined,
        note: !earned ? "Press to preview it on your AI." : undefined,
      },
      description: admin ? "Available to admins" : `${achievement.name}: ${goal}${earned ? " · Unlocked" : " to unlock"} · ${area}`,
    };
  };
  const gate = (reward: string | undefined, on: boolean, fallback?: ItemTip): Gate => {
    const about = reward ? rewardTip(reward) : undefined;
    return { locked: isLocked(reward), trying: on, tip: about?.tip ?? fallback, description: about?.description ?? fallback?.note, onTip: setShownTip };
  };

  const [idlePreview, setIdlePreview] = useState(0);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => { const query = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReduced(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  const [tab, setTab] = useState("Appearance");
  const [outfitName, setOutfitName] = useState("");
  const [notice, setNotice] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [reading, setReading] = useState(false);
  const speechId = useRef(0);
  const sample = SAMPLES[shownPersonality];
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const refresh = () => setVoices(speechSynthesis.getVoices());
    refresh(); speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => { speechId.current++; speechSynthesis.removeEventListener("voiceschanged", refresh); stopSpeaking(); };
  }, []);
  // A happy bounce on every change, then back to idle.
  const [mood, setMood] = useState<Mood>("idle");
  const dialogue = useDialogue("preview", !reading && (mood === "idle" || mood === "happy"));
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const bounce = () => { setMood("happy"); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setMood("idle"), 1600); };
  const change = (part: Partial<Look>) => { setLook(part); bounce(); };
  /** Wears an item, or, if it's still locked, tries it on in the preview (pressing again takes it off). */
  const pick = <K extends keyof Look>(field: K, value: Look[K]) => {
    if (isLocked(rewardFor(field, String(value)))) {
      setTryingLook(({ [field]: current, ...rest }) => current === value ? rest as Partial<Look> : { ...rest, [field]: value } as Partial<Look>);
      bounce();
      return;
    }
    setTryingLook(({ [field]: _gone, ...rest }) => rest as Partial<Look>);
    change({ [field]: value } as Partial<Look>);
  };
  const choiceFor = <K extends keyof Look>(field: K, value: Look[K], fallback?: ItemTip) => ({
    on: look[field] === value && trying[field] === undefined,
    onPick: () => pick(field, value),
    ...gate(rewardFor(field, String(value)), trying[field] === value, fallback),
  });
  const react = (next: Mood) => { window.clearTimeout(timer.current); setMood(next); timer.current = window.setTimeout(() => setMood("idle"), 2200); };
  const shape = SHAPES.find((s) => s.id === previewLook.shape)!;
  const options = useRef<HTMLDivElement>(null);
  const jump = (group: string) => options.current?.querySelector(`[data-group="${group}"]`)?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });

  return (
    <Modal title={`Customise ${name}`} icon={<Palette size={16} strokeWidth={1.75} />} onClose={onClose} width={1000} className="lemma-customise" bare>
      <div className="lemma-wardrobe">
        <aside className="lemma-wardrobe-preview" aria-label="Preview">
          <div className="lemma-preview-stage" data-trying={previewing || undefined}>
            <Face mood={mood} size={250} interactive idlePreview={idlePreview} dialogueRef={dialogue.attach} look={previewing ? previewLook : undefined} peer={previewing ? peer : undefined} />
          </div>
          <div className="lemma-preview-caption">
            <h3>{name} <span>/ {shape.name}</span></h3>
            <p aria-live="polite" aria-atomic="true" data-lemma-dialogue={dialogue.message?.kind}>{dialogue.message?.text ?? shape.description}</p>
          </div>
          {previewing && (
            <div className="lemma-trying" role="status">
              <strong><Eye size={13} aria-hidden="true" /> Preview only</strong>
              <span>{triedRewards.map(id => rewardSource(id)?.reward.name).join(", ")} {triedRewards.length === 1 ? "isn't" : "aren't"} unlocked yet, so {triedRewards.length === 1 ? "it won't" : "they won't"} be saved.</span>
              <button className="btn btn-sm" onClick={stopTrying}>Back to my look</button>
            </div>
          )}
          <div className="lemma-reaction-preview" role="group" aria-label="Preview automatic expressions">
            {(["idle", "thinking", "listening", "speaking"] as const).map(m => <button key={m} className="lemma-chip" aria-pressed={mood === m} onClick={() => react(m)}>{m === "speaking" ? "Answering" : m[0].toUpperCase() + m.slice(1)}</button>)}
          </div>
          <div className="lemma-preview-actions">
            <button className="btn btn-sm" disabled={!routineFor(previewLook.holding, admin, firstLight) || reduced || context.focused || prefs.movement === 0} title={reduced ? "Idle routines respect reduced motion" : context.focused ? "Idle routines pause during focus" : "Preview this item's idle routine"} onClick={() => { window.clearTimeout(timer.current); setMood("idle"); setIdlePreview(n => n + 1); }}><Play size={12} strokeWidth={2} /> Preview item animation</button>
            <button className="btn btn-sm btn-ghost" onClick={() => { stopTrying(); change(STANDARD); }} disabled={!previewing && sameLook(look, STANDARD)}><RotateCcw size={12} strokeWidth={1.75} /> Reset look</button>
          </div>
          <p className="lemma-preview-hint">Drag to turn · Tap to say hello · Saved as you choose</p>
        </aside>

        <div className="lemma-wardrobe-options">
          <div className="lemma-customise-tabs" role="tablist" aria-label="Customisation sections">
            {TABS.map(({ id: t, Icon }, i, all) => <button key={t} id={`lemma-tab-${t}`} role="tab" tabIndex={tab === t ? 0 : -1} aria-selected={tab === t} aria-controls="lemma-customise-panel" onClick={() => setTab(t)} onKeyDown={e => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault(); const next = e.key === "Home" ? all[0] : e.key === "End" ? all[all.length - 1] : all[(i + (e.key === "ArrowLeft" ? all.length - 1 : 1)) % all.length];
              setTab(next.id); document.getElementById(`lemma-tab-${next.id}`)?.focus();
            }}><Icon size={13} strokeWidth={1.75} aria-hidden="true" />{t}</button>)}
          </div>
          {tab === "Appearance" && <nav className="lemma-jump" aria-label="Appearance groups">{GROUPS.map(g => <button key={g} className="lemma-chip" onClick={() => jump(g)}>{g}</button>)}</nav>}
          <div ref={options} id="lemma-customise-panel" role="tabpanel" aria-labelledby={`lemma-tab-${tab}`} className="lemma-options-panel">
            {tab === "Appearance" && <>
              <Group id="Body" title="Body" intro="The shape of your AI and what it's made of.">
                <Row title="Shape">{SHAPES.map(s => { const Icon = SHAPE_ICONS[s.id]; return <Choice key={s.id} label={s.name} {...choiceFor("shape", s.id)}><Icon size={22} strokeWidth={1.4} /></Choice>; })}</Row>
                <Row title="Material">{FINISHES.map(f => { const Icon = FINISH_ICONS[f.id] ?? Circle; return <Choice key={f.id} label={f.name} {...choiceFor("finish", f.id)}><Icon size={20} strokeWidth={1.5} /></Choice>; })}</Row>
                <Row title="Hologram colour" compact>{GLOWS.map(g => <Swatch key={g.id} name={g.name} color={g.color} on={look.glow === g.id} onPick={() => change({ glow: g.id })} />)}</Row>
                <Row title="Shell colour" compact>{SHELLS.map(s => <Swatch key={s.id} name={s.name} color={s.color} on={look.shell === s.id} onPick={() => change({ shell: s.id })} />)}</Row>
              </Group>
              <Group id="Wear" title="Wear" intro="Mix and match. Each piece can have its own colour.">
                <Row title="Headwear">{ACCESSORIES.map(a => { const Icon = ACCESSORY_ICONS[a.id]; return <Choice key={a.id} label={a.name} {...choiceFor("accessory", a.id)}><Icon size={20} strokeWidth={1.5} /></Choice>; })}</Row>
                {look.accessory !== "none" && <ColourControl label="Headwear colour" value={look.headwearColor} fallback={headwearColour(look.accessory)} onChange={headwearColor => change({ headwearColor })} />}
                {look.accessory === "crown" && <ColourControl label="Crown jewel colour" value={look.jewelColor} fallback="#c52e58" onChange={jewelColor => change({ jewelColor })} />}
                <Row title="Facewear">{FACEWEAR.map(({ id, name: label }) => { const Icon = FACEWEAR_ICONS[id]; return <Choice key={id} label={label} {...choiceFor("facewear", id)}><Icon size={20} strokeWidth={1.5} /></Choice>; })}</Row>
                {look.facewear !== "none" && look.facewear !== "three-realms" && <ColourControl label="Facewear colour" value={look.facewearColor} fallback={FACEWEAR_COLOUR[look.facewear]} onChange={facewearColor => change({ facewearColor })} />}
                <Row title="Neckwear">{NECKWEAR.map(({ id, name: label }) => { const Icon = NECKWEAR_ICONS[id]; return <Choice key={id} label={label} {...choiceFor("neckwear", id)}><Icon size={20} strokeWidth={1.5} /></Choice>; })}</Row>
                {look.neckwear !== "none" && <ColourControl label={NECKWEAR_LABELS[look.neckwear] ?? "Bow tie colour"} value={look.neckwearColor} fallback={NECKWEAR_COLOUR[look.neckwear]} onChange={neckwearColor => change({ neckwearColor })} />}
              </Group>
              <Group id="Extras" title="Extras" intro={`What drifts around ${name}, and what it carries.`}>
                <Row title="Glow">{GLOW_EFFECTS.map(g => { const Icon = GLOW_ICONS[g.id]; return <Choice key={g.id} label={g.name} {...choiceFor("glowEffect", g.id)}><Icon size={20} strokeWidth={1.5} /></Choice>; })}</Row>
                <Row title="Holding">
                  {HOLDINGS.filter(h => !h.future && (!h.adminOnly || admin) && (!h.earlyOnly || firstLight) && (!h.secret || rewards.includes(h.id))).map(({ id, name: label, source, icon: Icon }) => (
                    <Choice key={id} label={label} {...choiceFor("holding", id, { name: label, note: source })}>{Icon ? <Icon size={19} strokeWidth={1.6} /> : <CircleSlash size={20} strokeWidth={1.5} />}</Choice>
                  ))}
                </Row>
              </Group>
            </>}

            {tab === "Personality" && <>
              <Group title="Name">
                <input className="field-input lemma-name" value={persona.name} maxLength={MAX_NAME} placeholder={DEFAULT_NAME} aria-label="Name" spellCheck={false} onChange={(e) => setPersona({ name: e.currentTarget.value })} />
              </Group>
              <Group title="Personality" intro="How it talks to you, and how it moves.">
                <div className="lemma-personalities" role="group" aria-label="Personality">
                  {PERSONALITIES.map((p) => {
                    const item = gate(p.reward, tryingPersonality === p.id && triedPersonality === p.id);
                    const on = persona.personality === p.id && !triedPersonality;
                    return (
                      <button key={p.id} className={`lemma-personality${on ? " is-on" : ""}${item.trying ? " is-trying" : ""}`} data-locked={item.locked || undefined} aria-description={item.description} aria-pressed={on || item.trying} {...tipEvents(item)}
                        onClick={() => { if (item.locked) { setTryingPersonality(item.trying ? null : p.id); return; } setTryingPersonality(null); setPersona({ personality: p.id }); }}>
                        <strong>{item.locked && <Lock size={10} aria-hidden="true" />}{p.name}</strong>
                        <span>{p.description}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="lemma-personality-sample"><small>“Help me get started on my work.”</small><p>{sample}</p></div>
              </Group>
              <Group title="Voice" intro="Which voices are available depends on this device.">
                <label className="lemma-control">Voice<select value={prefs.voice} onChange={e => setCompanionPrefs({ voice: e.currentTarget.value })} aria-label="Voice">
                  <option value="">Automatic voice</option>
                  {prefs.voice && !voices.some(v => v.voiceURI === prefs.voice) && <option value={prefs.voice}>Saved voice unavailable on this device</option>}
                  {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
                </select></label>
                <Slider label="Speech speed" value={prefs.rate} min={0.6} max={1.4} step={0.05} text={`${prefs.rate.toFixed(2)}×`} onChange={rate => setCompanionPrefs({ rate })} />
                <button className="btn btn-sm lemma-voice-preview" disabled={!("speechSynthesis" in window)} onClick={() => {
                  if (reading) { speechId.current++; stopSpeaking(); setReading(false); setMood("idle"); return; }
                  window.clearTimeout(timer.current); setReading(true); setMood("speaking");
                  const id = ++speechId.current;
                  speak(sample, () => { if (speechId.current === id) { setReading(false); setMood("idle"); } });
                }}>{reading ? <Square size={13} /> : <Volume2 size={13} />}{reading ? "Stop preview" : "Preview voice"}</button>
              </Group>
            </>}

            {tab === "Presence" && <>
              <Group title="Floating companion" intro={`${name} can stay with you while you work in other areas.`}>
                <Toggle label="Show in other areas" on={prefs.follow} onChange={follow => setCompanionPrefs({ follow })} />
                {prefs.follow && <label className="lemma-control">Companion position<select aria-label="Companion position" value={prefs.spot ? "moved" : prefs.corner} onChange={e => { if (e.currentTarget.value !== "moved") setCompanionPrefs({ corner: e.currentTarget.value as typeof prefs.corner, spot: null }); }}>{prefs.spot && <option value="moved">Where you moved it</option>}{CORNERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
              </Group>
              <Group title="Behaviour">
                <Toggle label="Occasional comments" hint="Short, silent reactions to animations, appearance and your day. Focus and conversation come first." on={prefs.chatter} onChange={chatter => setCompanionPrefs({ chatter })} />
                <Slider label="Idle movement" value={prefs.movement} min={0} max={1.5} step={0.1} text={prefs.movement === 0 ? "Still" : `${Math.round(prefs.movement * 100)}%`} onChange={movement => setCompanionPrefs({ movement })} />
                <Slider label="Hologram brightness" value={prefs.brightness} min={0.25} max={1.5} step={0.05} text={`${Math.round(prefs.brightness * 100)}%`} onChange={brightness => setCompanionPrefs({ brightness })} />
              </Group>
            </>}

            {tab === "Outfits" && <>
              <Group title="Save this look" intro={`Keep up to ${MAX_OUTFITS} looks, with their materials, accessories and colours.`}>
                <form className="lemma-outfit-form" onSubmit={e => {
                  e.preventDefault(); const title = outfitName.trim();
                  if (!title || prefs.outfits.length >= MAX_OUTFITS) return;
                  if (prefs.outfits.some(o => o.name.toLowerCase() === title.toLowerCase())) { setNotice("That name is already saved. Use Update to replace its look."); return; }
                  setCompanionPrefs({ outfits: [...prefs.outfits, { id: crypto.randomUUID(), name: title, look: { ...look } }] });
                  setOutfitName(""); setNotice(`${title} saved.`);
                }}><input className="field-input" aria-label="Outfit name" maxLength={32} placeholder="Study, Work, Gaming…" value={outfitName} onChange={e => setOutfitName(e.currentTarget.value)} /><button className="btn btn-sm" disabled={!outfitName.trim() || prefs.outfits.length >= MAX_OUTFITS}>Save outfit</button></form>
                <p role="status" className="field-hint">{notice}</p>
              </Group>
              <Group title="Your outfits">
                {prefs.outfits.map(outfit => <div className="lemma-outfit" key={outfit.id}>
                  <button className="lemma-outfit-wear" aria-label={`Wear ${outfit.name}`} onClick={() => { stopTrying(); change(lookForRole(outfit.look, admin, firstLight)); setNotice(`${outfit.name} applied.`); }}><Face mood="idle" size={52} alive={false} look={outfit.look} /><span>{outfit.name}</span></button>
                  <button className="btn btn-sm btn-ghost" aria-label={`Update ${outfit.name}`} onClick={() => { setCompanionPrefs({ outfits: prefs.outfits.map(o => o.id === outfit.id ? { ...o, look: { ...look } } : o) }); setNotice(`${outfit.name} updated.`); }}>Update</button>
                  <button className="icon-btn" aria-label={`Delete ${outfit.name}`} onClick={() => { setCompanionPrefs({ outfits: prefs.outfits.filter(o => o.id !== outfit.id) }); setNotice(`${outfit.name} deleted.`); }}><Trash2 size={14} /></button>
                </div>)}
                {prefs.outfits.length === 0 && <p className="field-hint">Nothing saved yet. Choose a look, then name it above.</p>}
              </Group>
            </>}
          </div>
        </div>
      </div>
      {shownTip && <TipCard {...shownTip} />}
    </Modal>
  );
}

/** Hover and keyboard focus both bring up an item's card. */
function tipEvents({ tip, onTip }: Pick<Gate, "tip" | "onTip">) {
  if (!tip) return {};
  const show = (e: { currentTarget: HTMLElement }) => onTip({ tip, box: e.currentTarget.getBoundingClientRect() });
  return { onMouseEnter: show, onFocus: show, onMouseLeave: () => onTip(null), onBlur: () => onTip(null) };
}

function TipCard({ tip, box }: Shown) {
  const host = useContext(ModalHostContext);
  const width = 264;
  const above = box.top > 210;
  const style = { width, left: Math.max(8, Math.min(window.innerWidth - width - 8, box.left + box.width / 2 - width / 2)), top: above ? box.top - 8 : box.bottom + 8, transform: above ? "translateY(-100%)" : undefined };
  return createPortal(
    <div className="lemma-tip" role="tooltip" style={style}>
      <header><strong>{tip.name}</strong>{tip.status && <span data-status={tip.status}>{tip.status}</span>}</header>
      {tip.from && <p className="lemma-tip-from">From <cite>{tip.from}</cite></p>}
      {tip.achievement && <dl>
        <div><dt>Achievement</dt><dd>{tip.achievement}</dd></div>
        <div><dt>To earn it</dt><dd>{tip.goal}</dd></div>
        <div><dt>Area</dt><dd>{tip.area}</dd></div>
      </dl>}
      {tip.progress && <div className="lemma-tip-progress"><i><b style={{ width: `${tip.progress.share * 100}%` }} /></i><small>{tip.progress.text}</small></div>}
      {tip.note && <p>{tip.note}</p>}
    </div>,
    host?.current ?? document.body,
  );
}

function Group({ id, title, intro, children }: { id?: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section className="lemma-group" data-group={id} aria-label={id ? `${title} options` : title}>
      <header><h3>{title}</h3>{intro && <p>{intro}</p>}</header>
      {children}
    </section>
  );
}

function Row({ title, compact = false, children }: { title: string; compact?: boolean; children: ReactNode }) {
  return (
    <section className="lemma-wardrobe-row" aria-label={title}>
      <h4>{title}</h4>
      <div className={compact ? "lemma-swatches" : "lemma-wardrobe-picks"}>{children}</div>
    </section>
  );
}

function ColourControl({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (value: string) => void }) {
  return <label className="lemma-colour-control"><span>{label}</span><input type="color" aria-label={label} value={/^#[\da-f]{6}$/i.test(value) ? value : fallback} onChange={e => onChange(e.currentTarget.value)} /><button className="btn btn-sm btn-ghost" aria-label={`Reset ${label.toLowerCase()}`} aria-pressed={value === "auto"} onClick={e => { e.preventDefault(); onChange("auto"); }}>Auto</button></label>;
}

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }) {
  return <div className="lemma-toggle"><span>{label}{hint && <small>{hint}</small>}</span><Switch label={label} on={on} onChange={onChange} /></div>;
}

function Slider({ label, value, min, max, step, text, onChange }: { label: string; value: number; min: number; max: number; step: number; text: string; onChange: (value: number) => void }) {
  return <label className="lemma-control"><span>{label}<output>{text}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.currentTarget.value))} /></label>;
}

function Swatch({ name, color, on, onPick }: { name: string; color: string; on: boolean; onPick: () => void }) {
  return (
    <button className={`lemma-swatch${on ? " is-on" : ""}`} style={{ background: color }} onClick={onPick} title={name} aria-label={name} aria-pressed={on}>
      {on && <Check size={13} strokeWidth={2.5} />}
    </button>
  );
}

function Choice({ label, on, onPick, children, locked, trying, tip, description, onTip }: { label: string; on: boolean; onPick: () => void; children: ReactNode } & Gate) {
  return (
    <button className={`lemma-choice${on ? " is-on" : ""}${trying ? " is-trying" : ""}`} onClick={onPick} title={tip ? undefined : label} aria-label={label} aria-description={description} aria-pressed={on || trying} data-locked={locked || undefined} {...tipEvents({ tip, onTip })}>
      {(locked || on) && <i className="lemma-choice-badge" aria-hidden="true">{trying ? <Eye size={10} /> : locked ? <Lock size={9} /> : <Check size={10} strokeWidth={3} />}</i>}
      {children}
      <span>{label}</span>
    </button>
  );
}
