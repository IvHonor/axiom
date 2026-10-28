// Talking to Lemma: recording what's said (stopping by itself once the
// speaker pauses), and reading replies aloud with the computer's own voices.
// Recordings are turned into 16 kHz mono WAV here, which every AI accepts.

/** Speech is louder than the room by this much, and at least `QUIETEST`. */
const ABOVE_ROOM = 3;
const QUIETEST = 0.006;
/** How long the room's own noise is measured for, at the start. */
const ROOM_MS = 300;
/** A pause this long after speaking ends the recording. */
const PAUSE_MS = 1500;
/** Nothing said for this long: stop listening. */
const NOTHING_MS = 8000;
/** The longest recording. */
const MAX_MS = 60_000;
const RATE = 16_000;

export interface Recording {
  /** Stops listening early; what's been recorded is kept. */
  stop: () => void;
  /** Throws it away. */
  cancel: () => void;
  /** The WAV, base64-encoded, or null when it was cancelled or nothing was heard. */
  result: Promise<{ audio: string; mime: string } | null>;
}

export interface Microphone {
  id: string;
  name: string;
}

/**
 * The microphones on this computer. Their names only show once Axiom may use
 * the microphone, so this asks for that first if it has to.
 */
export async function microphones(): Promise<Microphone[]> {
  const list = async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "audioinput");
  let found = await list();
  if (found.length && found.every((d) => !d.label)) {
    const stream = await open(undefined);
    stream.getTracks().forEach((t) => t.stop());
    found = await list();
  }
  return found.map((d, i) => ({ id: d.deviceId, name: d.label || `Microphone ${i + 1}` }));
}

/** The microphone's sound, with what went wrong said plainly. */
async function open(deviceId: string | undefined): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This computer doesn't let Axiom use a microphone.");
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true },
    });
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new Error(
        "Axiom isn't allowed to use the microphone. In Windows, open Settings → Privacy & security → Microphone and turn on \"Let desktop apps access your microphone\".",
      );
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      throw new Error("That microphone isn't connected. Pick another in the list beside the microphone button.");
    }
    if (name === "NotReadableError") throw new Error("Another app is using the microphone, or Windows blocked it. Close the other app and try again.");
    throw new Error("Axiom couldn't use the microphone. Check one is connected.");
  }
}

/** Starts listening on `deviceId` (or the computer's usual microphone). `onLevel` gets the loudness (0 to 1) as it changes. */
export async function record(onLevel?: (level: number) => void, deviceId?: string): Promise<Recording> {
  const stream = await open(deviceId);
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);

  const started = performance.now();
  let lastSpeech = 0;
  let heard = false;
  let byHand = false;
  let cancelled = false;
  let frame = 0;
  // The room's own noise, measured first, so a quiet microphone still counts.
  let room = 0;
  let roomSamples = 0;

  const finished = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  const stop = () => recorder.state !== "inactive" && recorder.stop();
  const watch = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    const level = Math.sqrt(sum / samples.length);
    onLevel?.(Math.min(1, level * 10));
    const now = performance.now();
    if (now - started < ROOM_MS) {
      room = (room * roomSamples + level) / ++roomSamples;
    } else if (level > Math.max(QUIETEST, room * ABOVE_ROOM)) {
      heard = true;
      lastSpeech = now;
    }
    const paused = heard && now - lastSpeech > PAUSE_MS;
    const silent = !heard && now - started > NOTHING_MS;
    if (paused || silent || now - started > MAX_MS) return stop();
    frame = requestAnimationFrame(watch);
  };
  recorder.start();
  frame = requestAnimationFrame(watch);

  const result = finished.then(async () => {
    cancelAnimationFrame(frame);
    stream.getTracks().forEach((t) => t.stop());
    await context.close().catch(() => {});
    onLevel?.(0);
    // Stopped by hand, it's sent whatever was heard: the AI judges better.
    if (cancelled || (!heard && !byHand) || !chunks.length) return null;
    const wav = await toWav(new Blob(chunks, { type: recorder.mimeType }));
    return { audio: base64(wav), mime: "audio/wav" };
  });
  return {
    stop: () => {
      byHand = true;
      stop();
    },
    cancel: () => {
      cancelled = true;
      stop();
    },
    result,
  };
}

/** Any recording the browser can play, as 16 kHz mono 16-bit WAV. */
async function toWav(recording: Blob): Promise<Uint8Array> {
  const decoder = new AudioContext();
  const decoded = await decoder.decodeAudioData(await recording.arrayBuffer());
  await decoder.close().catch(() => {});
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const pcm = (await offline.startRendering()).getChannelData(0);

  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const text = (at: number, s: string) => [...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  out.setUint32(4, 36 + pcm.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, 1, true);
  out.setUint32(24, RATE, true);
  out.setUint32(28, RATE * 2, true);
  out.setUint16(32, 2, true);
  out.setUint16(34, 16, true);
  text(36, "data");
  out.setUint32(40, pcm.length * 2, true);
  pcm.forEach((s, i) => out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Uint8Array(out.buffer);
}

function base64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

// ---------- Speaking ----------

/** Reads Lemma's words aloud, stopping anything it was still saying. `onEnd`
 *  runs once it's finished, been cut off, or couldn't speak at all. */
export function speak(text: string, onEnd?: () => void) {
  if (!("speechSynthesis" in window)) return onEnd?.();
  stopSpeaking();
  // Without the formatting marks, which would otherwise be read out.
  const plain = text.replace(/\*\*/g, "").replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
  const utterance = new SpeechSynthesisUtterance(plain);
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find((v) => v.lang === navigator.language && v.localService) ?? voices.find((v) => v.lang.startsWith("en") && v.localService) ?? null;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
}
