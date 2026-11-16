// Nexus's sound, made on the spot with Web Audio (no recordings): a soft pad of
// chords for each place that fades from one to the next as you go, and little
// sounds for doors, emotes, waves and spots. Quiet by design, and it starts
// only after you've clicked or pressed a key (browsers ask for that). Muting is
// remembered.

export type Ambience = "city" | "library" | "core" | "observatory" | "forge";
export type Cue = "door" | "emote" | "toast" | "spot" | "found";

/** Each place's chord (Hz) and how bright it sounds. */
const PADS: Record<Ambience, { notes: number[]; cutoff: number; wave: OscillatorType }> = {
  city: { notes: [110, 164.81, 220, 277.18], cutoff: 900, wave: "triangle" },
  library: { notes: [87.31, 130.81, 174.61, 220], cutoff: 600, wave: "sine" },
  core: { notes: [73.42, 110, 146.83, 220], cutoff: 750, wave: "sawtooth" },
  observatory: { notes: [220, 329.63, 440, 554.37], cutoff: 1800, wave: "sine" },
  forge: { notes: [98, 146.83, 196, 246.94], cutoff: 1000, wave: "triangle" },
};

const LOUDNESS = 0.18;

export interface NexusSound {
  setAmbience: (place: Ambience) => void;
  cue: (cue: Cue) => void;
  setMuted: (muted: boolean) => void;
  dispose: () => void;
}

export function createSound(muted: boolean): NexusSound {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let pad: { gain: GainNode; stop: () => void } | null = null;
  let place: Ambience = "city";
  let quiet = muted;

  /** Sound starts on the first click or key press. */
  const wake = () => {
    if (!Ctx || ctx) return;
    try {
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = quiet ? 0 : LOUDNESS;
      master.connect(ctx.destination);
      startPad(place);
    } catch {
      ctx = null;
    }
  };
  window.addEventListener("pointerdown", wake, { once: true, capture: true });
  window.addEventListener("keydown", wake, { once: true, capture: true });

  function startPad(which: Ambience) {
    if (!ctx || !master) return;
    const { notes, cutoff, wave } = PADS[which];
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 2.5);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    filter.Q.value = 0.7;
    // A slow sweep of the filter, so the pad breathes.
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 0.07;
    depth.gain.value = cutoff * 0.35;
    lfo.connect(depth).connect(filter.frequency);
    filter.connect(gain).connect(master);
    const voices = notes.flatMap((f, i) => [-4, 4].map((cents) => {
      const o = ctx!.createOscillator();
      o.type = wave;
      o.frequency.value = f;
      o.detune.value = cents + i;
      const v = ctx!.createGain();
      v.gain.value = (wave === "sawtooth" ? 0.03 : 0.07) / (1 + i * 0.4);
      o.connect(v).connect(filter);
      o.start();
      return o;
    }));
    lfo.start();
    pad = {
      gain,
      stop: () => {
        const t = ctx!.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + 2);
        for (const o of [...voices, lfo]) o.stop(t + 2.2);
      },
    };
  }

  /** A short note: `from` sliding to `to` Hz over `length` seconds. */
  function note(from: number, to: number, length: number, type: OscillatorType = "sine", loud = 0.4, delay = 0) {
    if (!ctx || !master) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + length);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(loud, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + length + 0.05);
  }

  /** A soft rush of air through a sweeping filter, for doors. */
  function whoosh() {
    if (!ctx || !master) return;
    const t = ctx.currentTime, length = 0.9;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.2;
    band.frequency.setValueAtTime(300, t);
    band.frequency.exponentialRampToValueAtTime(2400, t + length);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    noise.connect(band).connect(g).connect(master);
    noise.start(t);
  }

  return {
    setAmbience: (next) => {
      if (next === place) return;
      place = next;
      if (!ctx) return;
      pad?.stop();
      startPad(next);
    },
    cue: (cue) => {
      if (!ctx || quiet) return;
      if (cue === "door") whoosh();
      if (cue === "emote") note(660, 990, 0.18, "triangle", 0.3);
      if (cue === "spot") note(523.25, 783.99, 0.35, "sine", 0.25);
      if (cue === "toast") { note(880, 880, 0.25, "sine", 0.3); note(1318.5, 1318.5, 0.4, "sine", 0.25, 0.12); }
      if (cue === "found") [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => note(f, f, 0.5, "triangle", 0.25, i * 0.11));
    },
    setMuted: (next) => {
      quiet = next;
      if (ctx && master) master.gain.linearRampToValueAtTime(next ? 0 : LOUDNESS, ctx.currentTime + 0.3);
    },
    dispose: () => {
      window.removeEventListener("pointerdown", wake, { capture: true });
      window.removeEventListener("keydown", wake, { capture: true });
      pad?.stop();
      const closing = ctx;
      ctx = null;
      if (closing) window.setTimeout(() => void closing.close().catch(() => {}), 300);
    },
  };
}
