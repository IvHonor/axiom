import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Palette, RotateCcw, Circle, Box, Pyramid, Droplet, Headphones, CircleSlash, Crown, CircleEllipsis, GraduationCap, Ribbon, HatGlasses, Glasses, Trash2, Volume2, Square } from "lucide-react";
import { Modal } from "../../shell/ui/Modal";
import { Face, type Mood } from "./Face";
import { ACCESSORIES, FINISHES, GLOWS, HOLDINGS, SHAPES, SHELLS, STANDARD, hasFirstLight, lookForRole, setLook, useLook, type Look } from "./look";
import { DEFAULT_NAME, MAX_NAME, PERSONALITIES, nameOf, setPersona, usePersona } from "./persona";
import { MAX_OUTFITS, setCompanionPrefs, useCompanionPrefs } from "./preferences";
import { speak, stopSpeaking } from "../../lib/voice";
import { Switch } from "../../shell/ui/Switch";
import { useAccount } from "../../shell/useAccount";
import { useLemma } from "./state";
import { routineFor } from "./itemIdle";

const SAMPLES = {
  standard: "Let's start with one small task. What would you like to finish first?",
  cheerful: "Let's get a little momentum going! Pick one small task and we'll take it from there.",
  calm: "Take a breath. There is time to begin with one small, manageable step.",
  direct: "Choose your highest-priority task. Work on its first step for ten minutes.",
  witty: "The task probably won't do itself. I've asked. Let's give it ten minutes.",
  coach: "You've got a starting point: choose one task and commit to ten focused minutes. I'll help you keep moving.",
};

/** Lemma's wardrobe: a name, a personality, colours, shell, an accessory and something to hold, with a live preview. */
export function Customise({ onClose }: { onClose: () => void }) {
  const chosen = useLook();
  const [account] = useAccount();
  const admin = account?.state === "signed_in" && account.admin;
  const firstLight = hasFirstLight(account);
  const look = useMemo(() => lookForRole(chosen, admin, firstLight), [chosen, admin, firstLight]);
  const context = useLemma();
  const [idlePreview, setIdlePreview] = useState(0);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => { const query = window.matchMedia("(prefers-reduced-motion: reduce)"); const update = () => setReduced(query.matches); query.addEventListener("change", update); return () => query.removeEventListener("change", update); }, []);
  const persona = usePersona();
  const name = nameOf(persona);
  const prefs = useCompanionPrefs();
  const [tab, setTab] = useState("Appearance");
  const [outfitName, setOutfitName] = useState("");
  const [notice, setNotice] = useState("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [reading, setReading] = useState(false);
  const speechId = useRef(0);
  const sample = SAMPLES[persona.personality];
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const refresh = () => setVoices(speechSynthesis.getVoices());
    refresh(); speechSynthesis.addEventListener("voiceschanged", refresh);
    return () => { speechId.current++; speechSynthesis.removeEventListener("voiceschanged", refresh); stopSpeaking(); };
  }, []);
  // A happy bounce on every change, then back to idle.
  const [mood, setMood] = useState<Mood>("idle");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const change = (part: Partial<Look>) => {
    setLook(part);
    setMood("happy");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMood("idle"), 1600);
  };
  const react = (next: Mood) => { window.clearTimeout(timer.current); setMood(next); timer.current = window.setTimeout(() => setMood("idle"), 2200); };
  const shape = SHAPES.find((s) => s.id === look.shape)!;
  const holding = HOLDINGS.find((h) => h.id === look.holding)!;
  const shapeIcons = { orb: Circle, prism: Box, pyramid: Pyramid, drop: Droplet };
  const accessoryIcons = { none: CircleSlash, headphones: Headphones, halo: CircleEllipsis, cap: GraduationCap, beanie: HatGlasses, crown: Crown, bow: Ribbon };

  return (
    <Modal title={`Customise ${name}`} icon={<Palette size={16} strokeWidth={1.75} />} onClose={onClose} width={840} className="lemma-customise">
      <div className="lemma-wardrobe">
        <div className="lemma-wardrobe-preview">
          <span className="lemma-preview-eyebrow"><span /> YOUR PERSONAL AI</span>
          <div className="lemma-preview-stage"><Face mood={mood} size={300} interactive idlePreview={idlePreview} /></div>
          <div className="lemma-preview-caption"><h3>{name} <span>/ {shape.name}</span></h3><p>{shape.description}</p></div>
          <p className="lemma-preview-hint">Drag to turn · Tap to say hello</p>
          <div className="lemma-reaction-preview" aria-label="Preview automatic expressions">
            {(["idle", "thinking", "listening", "speaking"] as const).map(m => <button key={m} className="btn btn-sm btn-ghost" onClick={() => react(m)}>{m === "speaking" ? "Answering" : m[0].toUpperCase() + m.slice(1)}</button>)}
          </div>
          <button className="btn btn-sm btn-ghost" disabled={!routineFor(look.holding, admin, firstLight) || reduced || context.focused || prefs.movement === 0} title={reduced ? "Idle routines respect reduced motion" : context.focused ? "Idle routines pause during focus" : "Preview this item's idle routine"} onClick={() => { window.clearTimeout(timer.current); setMood("idle"); setIdlePreview(n => n + 1); }}>Preview item animation</button>
          <button className="btn btn-sm btn-ghost" onClick={() => change(STANDARD)} disabled={JSON.stringify(look) === JSON.stringify(STANDARD)}>
            <RotateCcw size={13} strokeWidth={1.75} /> Reset look
          </button>
        </div>
        <div className="lemma-wardrobe-options">
          <div className="lemma-wardrobe-intro"><h2>Make {name} yours.</h2><p>A familiar presence, with a name, a shape and a style of its own.</p></div>
          <div className="lemma-customise-tabs" role="tablist" aria-label="Customisation sections">
            {["Appearance", "Personality", "Presence", "Outfits"].map((t, i, all) => <button key={t} id={`lemma-tab-${t}`} role="tab" tabIndex={tab === t ? 0 : -1} aria-selected={tab === t} aria-controls="lemma-customise-panel" onClick={() => setTab(t)} onKeyDown={e => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
              e.preventDefault(); const next = e.key === "Home" ? all[0] : e.key === "End" ? all[all.length - 1] : all[(i + (e.key === "ArrowLeft" ? all.length - 1 : 1)) % all.length];
              setTab(next); document.getElementById(`lemma-tab-${next}`)?.focus();
            }}>{t}</button>)}
          </div>
          <div id="lemma-customise-panel" role="tabpanel" aria-labelledby={`lemma-tab-${tab}`} className="lemma-options-panel">
          {tab === "Personality" && <>
          <Row title="Name">
            <input
              className="field-input lemma-name"
              value={persona.name}
              maxLength={MAX_NAME}
              placeholder={DEFAULT_NAME}
              aria-label="Name"
              spellCheck={false}
              onChange={(e) => setPersona({ name: e.currentTarget.value })}
            />
          </Row>
          <Row title="Personality">
            {PERSONALITIES.map((p) => (
              <button key={p.id} className={`lemma-personality${persona.personality === p.id ? " is-on" : ""}`} onClick={() => setPersona({ personality: p.id })} aria-pressed={persona.personality === p.id}>
                <strong>{p.name}</strong>
                <span>{p.description}</span>
              </button>
            ))}
          </Row>
          <div className="lemma-personality-sample"><small>“Help me get started on my work.”</small><p>{sample}</p><small>Example of this personality's tone.</small></div>
          <label className="lemma-control">Voice<select value={prefs.voice} onChange={e => setCompanionPrefs({ voice: e.currentTarget.value })} aria-label="Voice">
            <option value="">Automatic voice</option>
            {prefs.voice && !voices.some(v => v.voiceURI === prefs.voice) && <option value={prefs.voice}>Saved voice unavailable on this device</option>}
            {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
          </select></label>
          <Slider label="Speech speed" value={prefs.rate} min={0.6} max={1.4} step={0.05} text={`${prefs.rate.toFixed(2)}×`} onChange={rate => setCompanionPrefs({ rate })} />
          <button className="btn btn-sm" disabled={!("speechSynthesis" in window)} onClick={() => {
            if (reading) { speechId.current++; stopSpeaking(); setReading(false); setMood("idle"); return; }
            window.clearTimeout(timer.current); setReading(true); setMood("speaking");
            const id = ++speechId.current;
            speak(sample, () => { if (speechId.current === id) { setReading(false); setMood("idle"); } });
          }}>{reading ? <Square size={13} /> : <Volume2 size={13} />}{reading ? "Stop preview" : "Preview voice"}</button>
          <p className="field-hint">Voice availability depends on this device. Your saved choice falls back to an automatic voice when unavailable.</p>
          </>}
          {tab === "Appearance" && <>
          <Row title="Body">
            {SHAPES.map((s) => {
              const Icon = shapeIcons[s.id];
              return <Choice key={s.id} on={look.shape === s.id} onPick={() => change({ shape: s.id })} label={s.name}><Icon size={23} strokeWidth={1.4} /></Choice>;
            })}
          </Row>
          <Row title="Material">{FINISHES.map(f => <Choice key={f.id} label={f.name} on={look.finish === f.id} onPick={() => change({ finish: f.id })}><Circle size={20} /></Choice>)}</Row>
          <Row title="Hologram colour">
            {GLOWS.map((g) => (
              <Swatch key={g.id} name={g.name} color={g.color} on={look.glow === g.id} onPick={() => change({ glow: g.id })} />
            ))}
          </Row>
          <Row title="Shell colour">
            {SHELLS.map((s) => (
              <Swatch key={s.id} name={s.name} color={s.color} on={look.shell === s.id} onPick={() => change({ shell: s.id })} />
            ))}
          </Row>
          <Row title="Headwear">
            {ACCESSORIES.map((a) => {
              const Icon = accessoryIcons[a.id];
              return <Choice key={a.id} on={look.accessory === a.id} onPick={() => change({ accessory: a.id })} label={a.name}><Icon size={20} strokeWidth={1.5} /></Choice>;
            })}
          </Row>
          {look.accessory !== "none" && <ColourControl label="Headwear colour" value={look.headwearColor} fallback={look.accessory === "crown" || look.accessory === "halo" ? "#ffd078" : "#466b85"} onChange={headwearColor => change({ headwearColor })} />}
          {look.accessory === "crown" && <ColourControl label="Crown jewel colour" value={look.jewelColor} fallback="#c52e58" onChange={jewelColor => change({ jewelColor })} />}
          <Row title="Facewear">{(["none", "glasses", "sunglasses"] as const).map((id) => <Choice key={id} label={id === "none" ? "No facewear" : id === "glasses" ? "Glasses" : "Sunglasses"} on={look.facewear === id} onPick={() => change({ facewear: id })}><Glasses size={20} /></Choice>)}</Row>
          {look.facewear !== "none" && <ColourControl label="Facewear colour" value={look.facewearColor} fallback={look.facewear === "sunglasses" ? "#161b20" : "#d7e1e5"} onChange={facewearColor => change({ facewearColor })} />}
          <Row title="Neckwear">{(["none", "bow"] as const).map(id => <Choice key={id} label={id === "none" ? "No neckwear" : "Bow tie"} on={look.neckwear === id} onPick={() => change({ neckwear: id })}><Ribbon size={20} /></Choice>)}</Row>
          {look.neckwear === "bow" && <ColourControl label="Bow tie colour" value={look.neckwearColor} fallback="#b83f55" onChange={neckwearColor => change({ neckwearColor })} />}
          <Row title="Holding">
            {HOLDINGS.filter(h => !h.future && (!h.adminOnly || admin) && (!h.earlyOnly || firstLight)).map(({ id, name, icon: Icon }) => (
              <Choice key={id} on={look.holding === id} onPick={() => change({ holding: id })} label={name}>
                <span className="lemma-holding">{Icon ? <Icon size={18} strokeWidth={1.75} /> : "–"}</span>
              </Choice>
            ))}
          </Row>
          <p className="field-hint" role="status"><strong>{holding.name}</strong>: {holding.source}</p>
          </>}
          {tab === "Presence" && <>
            <Slider label="Companion size" value={prefs.size} min={120} max={240} step={10} text={`${prefs.size}px`} onChange={size => setCompanionPrefs({ size })} />
            <Slider label="Glow brightness" value={prefs.brightness} min={0.25} max={1.5} step={0.05} text={`${Math.round(prefs.brightness * 100)}%`} onChange={brightness => setCompanionPrefs({ brightness })} />
            <Slider label="Idle movement" value={prefs.movement} min={0} max={1.5} step={0.1} text={prefs.movement === 0 ? "Still" : `${Math.round(prefs.movement * 100)}%`} onChange={movement => setCompanionPrefs({ movement })} />
            <label className="lemma-control">Companion position<select aria-label="Companion position" value={prefs.spot ? "moved" : prefs.corner} onChange={e => { if (e.currentTarget.value !== "moved") setCompanionPrefs({ corner: e.currentTarget.value as typeof prefs.corner, spot: null }); }}>{prefs.spot && <option value="moved">where you moved it</option>}{(["bottom-right", "bottom-left", "top-right", "top-left"] as const).map(c => <option key={c} value={c}>{c.replace("-", " ")}</option>)}</select></label>
            <div className="lemma-follow-control"><span>Follow me between areas</span><Switch label="Follow me between areas" on={prefs.follow} onChange={follow => setCompanionPrefs({ follow })} /></div>
            <p className="field-hint">Size and position apply to the floating companion inside Axiom. Brightness and idle movement apply to every live Lemma. Your system's reduced-motion setting takes priority.</p>
          </>}
          {tab === "Outfits" && <>
            <form className="lemma-outfit-form" onSubmit={e => {
              e.preventDefault(); const title = outfitName.trim();
              if (!title || prefs.outfits.length >= MAX_OUTFITS) return;
              if (prefs.outfits.some(o => o.name.toLowerCase() === title.toLowerCase())) { setNotice("That name is already saved. Use Update to replace its look."); return; }
              setCompanionPrefs({ outfits: [...prefs.outfits, { id: crypto.randomUUID(), name: title, look: { ...look } }] });
              setOutfitName(""); setNotice(`${title} saved.`);
            }}><input className="field-input" aria-label="Outfit name" maxLength={32} placeholder="Study, Work, Gaming…" value={outfitName} onChange={e => setOutfitName(e.currentTarget.value)} /><button className="btn btn-sm" disabled={!outfitName.trim() || prefs.outfits.length >= MAX_OUTFITS}>Save outfit</button></form>
            <p className="field-hint">Save up to {MAX_OUTFITS} looks. Materials, accessories and colours are included.</p>
            {prefs.outfits.map(outfit => <div className="lemma-outfit" key={outfit.id}>
              <button className="lemma-outfit-wear" aria-label={`Wear ${outfit.name}`} onClick={() => { change(lookForRole(outfit.look, admin, firstLight)); setNotice(`${outfit.name} applied.`); }}><Face mood="idle" size={60} alive={false} look={outfit.look} /><span>{outfit.name}</span></button>
              <button className="btn btn-sm btn-ghost" aria-label={`Update ${outfit.name}`} onClick={() => { setCompanionPrefs({ outfits: prefs.outfits.map(o => o.id === outfit.id ? { ...o, look: { ...look } } : o) }); setNotice(`${outfit.name} updated.`); }}>Update</button>
              <button className="icon-btn" aria-label={`Delete ${outfit.name}`} onClick={() => { setCompanionPrefs({ outfits: prefs.outfits.filter(o => o.id !== outfit.id) }); setNotice(`${outfit.name} deleted.`); }}><Trash2 size={14} /></button>
            </div>)}
            {prefs.outfits.length === 0 && <p className="field-hint">Choose a look in Appearance, then save it here.</p>}
            <p role="status" className="field-hint">{notice}</p>
          </>}
          </div>
          <p className="field-hint">Saved as you choose. While working, {name} swaps its keepsake for a little task tablet.</p>
        </div>
      </div>
    </Modal>
  );
}

function ColourControl({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (value: string) => void }) {
  return <label className="lemma-colour-control"><span>{label}</span><input type="color" aria-label={label} value={/^#[\da-f]{6}$/i.test(value) ? value : fallback} onChange={e => onChange(e.currentTarget.value)} /><button className="btn btn-sm btn-ghost" aria-label={`Reset ${label.toLowerCase()}`} aria-pressed={value === "auto"} onClick={e => { e.preventDefault(); onChange("auto"); }}>Auto</button></label>;
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="lemma-wardrobe-row" aria-label={title}>
      <h3>{title}</h3>
      <div className="lemma-wardrobe-picks">{children}</div>
    </section>
  );
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

function Choice({ label, on, onPick, children }: { label: string; on: boolean; onPick: () => void; children: React.ReactNode }) {
  return (
    <button className={`lemma-choice${on ? " is-on" : ""}`} onClick={onPick} title={label} aria-label={label} aria-pressed={on}>
      {children}
      <span>{label}</span>
    </button>
  );
}
