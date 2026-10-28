import { useEffect, useRef, useState } from "react";
import { Check, Palette, RotateCcw, Circle, Box, Pyramid, Droplet, Headphones, CircleSlash, Crown, CircleEllipsis, GraduationCap, Ribbon, HatGlasses } from "lucide-react";
import { Modal } from "../../shell/ui/Modal";
import { Face, type Mood } from "./Face";
import { ACCESSORIES, GLOWS, HOLDINGS, SHAPES, SHELLS, STANDARD, setLook, useLook, type Look } from "./look";
import { DEFAULT_NAME, MAX_NAME, PERSONALITIES, nameOf, setPersona, usePersona } from "./persona";

/** Lemma's wardrobe: a name, a personality, colours, shell, an accessory and something to hold, with a live preview. */
export function Customise({ onClose }: { onClose: () => void }) {
  const look = useLook();
  const persona = usePersona();
  const name = nameOf(persona);
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
  const shape = SHAPES.find((s) => s.id === look.shape)!;
  const shapeIcons = { orb: Circle, prism: Box, pyramid: Pyramid, drop: Droplet };
  const accessoryIcons = { none: CircleSlash, headphones: Headphones, halo: CircleEllipsis, cap: GraduationCap, beanie: HatGlasses, crown: Crown, bow: Ribbon };

  return (
    <Modal title={`Customise ${name}`} icon={<Palette size={16} strokeWidth={1.75} />} onClose={onClose} width={840} className="lemma-customise">
      <div className="lemma-wardrobe">
        <div className="lemma-wardrobe-preview">
          <span className="lemma-preview-eyebrow"><span /> YOUR PERSONAL AI</span>
          <div className="lemma-preview-stage"><Face mood={mood} size={300} interactive /></div>
          <div className="lemma-preview-caption"><h3>{name} <span>/ {shape.name}</span></h3><p>{shape.description}</p></div>
          <p className="lemma-preview-hint">Drag to turn · Tap to say hello</p>
          <button className="btn btn-sm btn-ghost" onClick={() => change(STANDARD)} disabled={JSON.stringify(look) === JSON.stringify(STANDARD)}>
            <RotateCcw size={13} strokeWidth={1.75} /> Reset look
          </button>
        </div>
        <div className="lemma-wardrobe-options">
          <div className="lemma-wardrobe-intro"><h2>Make {name} yours.</h2><p>A familiar presence, with a name, a shape and a style of its own.</p></div>
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
          <Row title="Body">
            {SHAPES.map((s) => {
              const Icon = shapeIcons[s.id];
              return <Choice key={s.id} on={look.shape === s.id} onPick={() => change({ shape: s.id })} label={s.name}><Icon size={23} strokeWidth={1.4} /></Choice>;
            })}
          </Row>
          <Row title="Hologram colour">
            {GLOWS.map((g) => (
              <Swatch key={g.id} name={g.name} color={g.color} on={look.glow === g.id} onPick={() => change({ glow: g.id })} />
            ))}
          </Row>
          <Row title="Shell finish">
            {SHELLS.map((s) => (
              <Swatch key={s.id} name={s.name} color={s.color} on={look.shell === s.id} onPick={() => change({ shell: s.id })} />
            ))}
          </Row>
          <Row title="Headwear & accessories">
            {ACCESSORIES.map((a) => {
              const Icon = accessoryIcons[a.id];
              return <Choice key={a.id} on={look.accessory === a.id} onPick={() => change({ accessory: a.id })} label={a.name}><Icon size={20} strokeWidth={1.5} /></Choice>;
            })}
          </Row>
          <Row title="Holding">
            {HOLDINGS.map(({ id, name, icon: Icon }) => (
              <Choice key={id} on={look.holding === id} onPick={() => change({ holding: id })} label={name}>
                <span className="lemma-holding">{Icon ? <Icon size={18} strokeWidth={1.75} /> : "–"}</span>
              </Choice>
            ))}
          </Row>
          <p className="field-hint">Saved as you choose. Leave the name empty for Lemma. While working, {name} swaps its keepsake for a little task tablet.</p>
        </div>
      </div>
    </Modal>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="lemma-wardrobe-row" aria-label={title}>
      <h3>{title}</h3>
      <div className="lemma-wardrobe-picks">{children}</div>
    </section>
  );
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
