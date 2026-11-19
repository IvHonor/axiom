// A secret, for anyone who has finished a certain book: a shadow asks three
// questions, and only a firm answer sends it back. All the words are our own.
import { useContext, useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ModalHostContext } from "../../../shell/ui/Modal";
import { Face, type Mood } from "../Face";
import { INTERVIEW_SECRET } from "./catalog";
import { markFound } from "./secrets";
import { refreshRewards } from "./useAchievementRewards";

const QUESTIONS = [
  { ask: "Who steers your days?", answers: ["Whoever asks first", "Luck", "I do"], right: 2 },
  { ask: "What do you do when you fall?", answers: ["Learn and rise", "Stop", "Blame someone"], right: 0 },
  { ask: "Where are you going?", answers: ["Wherever it takes me", "I've decided", "I'll know later"], right: 1 },
];
const REBUKES = ["The shadow grows.", "It leans closer.", "The needle spins faster."];

const FIGURE = "M-158 170C-150 92-122 22-68-8C-52-17-41-27-37-41C-43-53-45-66-41-78C-72-88-116-114-128-168C-104-130-68-114-29-107C-17-117 17-117 29-107C68-114 104-130 128-168C116-114 72-88 41-78C45-66 43-53 37-41C41-27 52-17 68-8C122 22 150 92 158 170Z";
const WISPS = [[-118, 96, 34, "0s"], [-72, 128, 26, "2.4s"], [-20, 150, 30, "4.6s"], [58, 140, 28, "1.2s"], [116, 104, 36, "3.5s"]] as const;
/** The pieces the shadow breaks into. */
const SHARDS = Array.from({ length: 20 }, (_, i) => {
  const a = i * 2.4, r = 22 + i * 5.2, x = Math.cos(a) * r, y = Math.sin(a) * r * 0.95 + 8, s = 9 + (i % 4) * 5;
  return {
    d: `M${x.toFixed(1)} ${(y - s).toFixed(1)}L${(x + s * 0.8).toFixed(1)} ${(y + s * 0.6).toFixed(1)}L${(x - s * 0.7).toFixed(1)} ${(y + s * 0.5).toFixed(1)}Z`,
    style: { "--dx": `${(Math.cos(a) * (130 + i * 6)).toFixed(0)}px`, "--dy": `${(Math.sin(a) * (120 + i * 6) - 40).toFixed(0)}px`, "--turn": `${(i % 2 ? 1 : -1) * (130 + i * 16)}deg` } as CSSProperties,
  };
});

export function Interview({ replay, onClose }: { replay: boolean; onClose: () => void }) {
  const host = useContext(ModalHostContext);
  const [step, setStep] = useState(0);
  // How much the shadow has been fed by wrong answers.
  const [doubts, setDoubts] = useState(0);
  const [rebuke, setRebuke] = useState("");
  const finished = step >= QUESTIONS.length;
  const root = useRef<HTMLDivElement>(null);
  const leave = useRef<HTMLButtonElement>(null);
  useEffect(() => { root.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (!finished) return;
    leave.current?.focus();
    if (!replay) { markFound(INTERVIEW_SECRET); refreshRewards(); }
  }, [finished, replay]);

  const answer = (index: number) => {
    if (index === QUESTIONS[step].right) { setStep(step + 1); setRebuke(""); return; }
    setRebuke(REBUKES[doubts % REBUKES.length]);
    setDoubts(doubts + 1);
  };
  const power = finished ? 0 : Math.max(0.24, 1 - step * 0.27 + doubts * 0.1);
  const mood: Mood = finished ? "happy" : doubts > step ? "concerned" : "listening";
  const style = { "--shadow": power, "--spin": `${Math.max(0.26, 1.5 - doubts * 0.28 + step * 0.32)}s` } as CSSProperties;

  return createPortal(
    <div ref={root} className="interview" role="dialog" aria-modal="true" aria-label="The Interview" tabIndex={-1} data-finished={finished || undefined} style={style}>
      <button className="icon-btn interview-close" aria-label="Leave" onClick={onClose}><X size={17} /></button>
      {/* Alternates, so each wrong answer restarts the shudder without rebuilding Lemma. */}
      <div className="interview-stage" data-struck={doubts ? (doubts % 2) + 1 : undefined}>
        <svg className="interview-scene" viewBox="-170 -175 340 350" aria-hidden="true">
          <defs>
            <linearGradient id="interview-cloak" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#030104" /><stop offset="0.68" stopColor="#050206" /><stop offset="1" stopColor="#050206" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="interview-edge" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#b23a4c" /><stop offset="0.5" stopColor="#6d1f2e" stopOpacity="0.7" /><stop offset="0.9" stopColor="#6d1f2e" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="interview-glow"><stop offset="0" stopColor="#ff6a2a" stopOpacity="0.75" /><stop offset="1" stopColor="#ff6a2a" stopOpacity="0" /></radialGradient>
            <radialGradient id="interview-smoke"><stop offset="0" stopColor="#1a0c14" stopOpacity="0.9" /><stop offset="1" stopColor="#1a0c14" stopOpacity="0" /></radialGradient>
            <linearGradient id="interview-light" gradientUnits="userSpaceOnUse" x1="112" y1="122" x2="0" y2="-90">
              <stop offset="0" stopColor="#fff0c4" stopOpacity="0.95" /><stop offset="1" stopColor="#ffdf9a" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g className="interview-figure">
            <g className="interview-breath">
              {WISPS.map(([x, y, r, delay]) => <ellipse key={x} className="interview-wisp" cx={x} cy={y} rx={r} ry={r * 1.5} fill="url(#interview-smoke)" style={{ "--delay": delay } as CSSProperties} />)}
              <path d={FIGURE} fill="url(#interview-cloak)" stroke="url(#interview-edge)" strokeWidth="1.3" />
              <g className="interview-eyes">
                <ellipse cx="-20" cy="-66" rx="24" ry="15" fill="url(#interview-glow)" />
                <ellipse cx="20" cy="-66" rx="24" ry="15" fill="url(#interview-glow)" />
                <path d="M-32-73Q-18-73-9-60Q-23-60-32-73Z" fill="#ff6a2a" />
                <path d="M32-73Q18-73 9-60Q23-60 32-73Z" fill="#ff6a2a" />
              </g>
            </g>
          </g>
          {SHARDS.map(({ d, style: flight }) => <path key={d} className="interview-shard" d={d} style={flight} />)}
          <polygon className="interview-beam" points="106,116 118,128 44,-150 -66,-110" fill="url(#interview-light)" />
          <g transform="translate(112 122) scale(0.78)">
            <circle className="interview-ring" r="44" />
            <circle className="interview-face" r="46" />
            <circle className="interview-dial" r="39" />
            <g className="interview-ticks">{Array.from({ length: 16 }, (_, i) => <line key={i} y1="-39" y2={i % 4 ? "-35" : "-31"} transform={`rotate(${i * 22.5})`} />)}</g>
            <g className="interview-needle"><path className="interview-north" d="M0-33L6 0H-6Z" /><path className="interview-south" d="M0 33L6 0H-6Z" /></g>
            <circle className="interview-pin" r="3.5" />
          </g>
        </svg>
        <div className="interview-lemma"><Face mood={mood} size={210} /></div>
      </div>
      {finished ? (
        <div className="interview-words" role="status">
          <small>{replay ? "You held your course" : "Achievement unlocked"}</small>
          <h2>The Non-Drifter</h2>
          <p>The shadow has nothing left to ask. {replay ? "It will try again." : "The True Compass is yours."}</p>
          <button ref={leave} className="interview-leave" onClick={onClose}>Hold your course</button>
        </div>
      ) : (
        <div className="interview-words">
          <small>Question {step + 1} of {QUESTIONS.length}</small>
          <h2 aria-live="polite">“{QUESTIONS[step].ask}”</h2>
          <div className="interview-answers">
            {QUESTIONS[step].answers.map((text, i) => <button key={text} className="interview-answer" onClick={() => answer(i)}>{text}</button>)}
          </div>
          <p className="interview-rebuke" role="status">{rebuke}</p>
        </div>
      )}
    </div>,
    host?.current ?? document.body,
  );
}
