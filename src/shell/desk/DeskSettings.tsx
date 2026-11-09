// Lemma's settings for the desktop: when he's there, where, how big, the
// hotkey, what he says, and a button to bring him out now.
import { globalShortcut, isMac } from "../../lib/shortcut";
import { useEffect, useState } from "react";
import { MonitorUp } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useAssistantName } from "../../features/lemma/persona";
import { ErrorNote } from "../account/fields";
import { Switch } from "../ui/Switch";
import { DESK_CORNERS, DESK_MODES, DESK_ROUNDS, DESK_STYLES, setDeskPrefs, SIZE, useDeskPrefs, WEATHER_FROM, type DeskPrefs } from "./deskSetting";
import { showDesk, weatherIn, type Weather } from "./timers";
import "./desk.css";

export function DeskSettings() {
  const prefs = useDeskPrefs();
  const me = useAssistantName();
  const [note, setNote] = useState<string | null>(null);

  const toggles: { key: keyof Pick<DeskPrefs, "hotkey" | "timerKeys" | "nudges" | "cheers" | "quiet" | "away" | "sound" | "breaks" | "checkin">; label: string; hint: string }[] = [
    { key: "hotkey", label: globalShortcut("Ctrl+Alt+Space to talk"), hint: `From any app, ${me} comes out and listens.` },
    { key: "timerKeys", label: "Timer keys", hint: globalShortcut("From any app: Ctrl+Alt+P pauses, carries on or starts today's next task; Ctrl+Alt+D finishes it.") },
    {
      key: "nudges",
      label: "What's worth knowing",
      hint: "A hello in the morning, birthdays and bills, a wrap-up in the evening, what's coming up (with Join for meetings online), goals that need a push.",
    },
    { key: "cheers", label: "Cheers", hint: `${me} celebrates when you finish things.` },
    {
      key: "quiet",
      label: "Quiet in full screen and calls",
      // Full screen and calls are only spotted on Windows so far (an online meeting in the calendar works everywhere).
      hint: isMac
        ? `During an online meeting from your calendar, ${me} keeps out of the way. (Full-screen apps and calls are only spotted on Windows for now.)`
        : `While a game, video, presentation or call is on, ${me} keeps out of the way. Checked on this computer only.`,
    },
    { key: "away", label: "Notice time away", hint: `Away from the computer with a timer running, ${me} asks whether to count it when you're back.` },
    { key: "sound", label: "Chime", hint: "A soft sound when time's up, a reminder rings or a meeting's about to start." },
    { key: "breaks", label: "Break nudges", hint: "After 50 minutes at the computer: stand up, look away, have some water." },
    { key: "checkin", label: "Evening check-in", hint: "At 8pm, how was today? One tap saves it to your journal." },
  ];

  return (
    <div className="desk-settings">
      <p className="field-hint">
        {me} floats over your other windows and becomes the timer while a task, study or reading timer runs. Double-click him to talk, or middle-click
        to type: he does small things straight away (time, add, move or tick off a task, log reading, study time or spending, set a reminder), each
        with an Undo, and hands anything bigger to a chat here. Drop text on him for a task, a link for Learning or Reading, or a file for your
        journal. Ask him to keep your screen awake (up to 4 hours) and a small countdown shows under him until it can sleep again. Hold him down for a quick menu (a task, a reminder, a note, a 25 or 50 minute focus, keeping awake). Nothing said on the desktop is kept. Drag him anywhere (he snaps to the edges and remembers where), scroll over him to resize him, and right-click him for more.
      </p>

      <div className="desk-setting">
        <span className="field-label">On the desktop</span>
        <div className="pb-segmented" role="radiogroup" aria-label={`When ${me} is on the desktop`}>
          {DESK_MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={prefs.mode === m.id} className={prefs.mode === m.id ? "is-active" : undefined} onClick={() => setDeskPrefs({ mode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="desk-setting">
        <span className="field-label">Style</span>
        <div className="pb-segmented" role="radiogroup" aria-label={`How ${me} sits on the desktop`}>
          {DESK_STYLES.map((s) => (
            <button key={s.id} role="radio" aria-checked={prefs.style === s.id} className={prefs.style === s.id ? "is-active" : undefined} onClick={() => setDeskPrefs({ style: s.id })}>
              {s.label}
            </button>
          ))}
        </div>
        <small className="field-hint">
          Tucked into the edge, {me} waits in a notch on the side of the screen, showing your timer, a meeting coming up or a reminder. Point at it for a peek at what's on; he pops
          out when you stay, click, or he has something to say.
        </small>
      </div>

      <div className="desk-setting">
        <span className="field-label">Corner</span>
        <div className="pb-segmented" role="radiogroup" aria-label={`Where ${me} sits`}>
          {DESK_CORNERS.map((c) => (
            <button key={c.id} role="radio" aria-checked={prefs.corner === c.id} className={prefs.corner === c.id ? "is-active" : undefined} onClick={() => setDeskPrefs({ corner: c.id })}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="desk-setting">
        <span className="field-label">Focus in rounds</span>
        <div className="pb-segmented" role="radiogroup" aria-label="Focus in rounds">
          {DESK_ROUNDS.map((r) => (
            <button key={r.id} role="radio" aria-checked={prefs.rounds === r.id} className={prefs.rounds === r.id ? "is-active" : undefined} onClick={() => setDeskPrefs({ rounds: r.id })}>
              {r.label}
            </button>
          ))}
        </div>
        <small className="field-hint">A timed task pauses for a break, and {me} says when to carry on.</small>
      </div>

      <div className="desk-setting">
        <label className="field-label" htmlFor="desk-size">
          Size
        </label>
        <input
          id="desk-size"
          className="desk-size"
          type="range"
          min={SIZE.smallest}
          max={SIZE.largest}
          step={SIZE.step}
          value={prefs.size}
          onChange={(e) => setDeskPrefs({ size: Number(e.currentTarget.value) })}
        />
      </div>

      <WeatherSetting me={me} />


      <ul className="assistant-areas">
        {toggles.map((t) => (
          <li key={t.key}>
            <span className="assistant-area-name">
              {t.label}
              <small className="field-hint">{t.hint}</small>
            </span>
            <Switch on={prefs[t.key]} onChange={(on) => setDeskPrefs({ [t.key]: on })} label={t.label} />
          </li>
        ))}
      </ul>

      {isTauri() && (
        <div className="row">
          <button
            className="btn btn-sm"
            onClick={() => {
              setNote(null);
              showDesk(prefs.corner).catch((e) => setNote(String(e)));
            }}
          >
            <MonitorUp size={13} strokeWidth={1.75} /> Show {me} now
          </button>
          <ErrorNote error={note} />
        </div>
      )}
    </div>
  );
}

/** How the weather's place was found, in words. */
const FOUND_BY: Record<Weather["source"], string> = {
  location: "from Windows' location services",
  timezone: "from your computer's time zone",
  place: "",
};

/**
 * The weather in his halo: where the computer is (found on it), a place
 * you name, or off. Shows what it found, and how, so it's never a mystery.
 */
function WeatherSetting({ me }: { me: string }) {
  const prefs = useDeskPrefs();
  const from = prefs.weatherFrom;
  const [found, setFound] = useState<{ weather: Weather | null; error: string | null } | null>(null);
  useEffect(() => {
    setFound(null);
    if (!isTauri() || from === "off" || (from === "place" && !prefs.weather)) return;
    let gone = false;
    weatherIn(from === "place" ? prefs.weather : "", from === "auto").then(
      (weather) => !gone && setFound({ weather, error: null }),
      (e) => !gone && setFound({ weather: null, error: String(e).replace(/^Error: /, "") }),
    );
    return () => {
      gone = true;
    };
  }, [from, prefs.weather]);

  const how = { clear: "clear", clouds: "cloudy", fog: "foggy", rain: "raining", snow: "snowing", storm: "stormy" };
  let status: string | null = null;
  if (found?.error) status = found.error;
  else if (found && !found.weather) status = from === "auto" ? "Couldn't work out where this computer is. Choose a place instead." : `Couldn't find "${prefs.weather}".`;
  else if (found?.weather) {
    const w = found.weather;
    const where = w.source === "location" ? "where you are" : `in ${w.place}`;
    status = `Now: ${Math.round(w.temperature)}° and ${w.kind === "clear" && w.day ? "sunny" : how[w.kind]} ${where}${w.source === "place" ? "" : `, ${FOUND_BY[w.source]}`}.`;
  } else if (from !== "off" && (from === "auto" || prefs.weather)) status = from === "auto" ? "Finding where this computer is…" : "Looking it up…";

  return (
    <div className="desk-setting field">
      <span className="field-label">Weather in his halo</span>
      <div className="pb-segmented" role="radiogroup" aria-label="Where the weather is for">
        {WEATHER_FROM.map((w) => (
          <button key={w.id} role="radio" aria-checked={from === w.id} className={from === w.id ? "is-active" : undefined} onClick={() => setDeskPrefs({ weatherFrom: w.id })}>
            {w.label}
          </button>
        ))}
      </div>
      {from === "place" && (
        <input
          id="desk-weather"
          aria-label="Town or city"
          placeholder="Your town or city"
          defaultValue={prefs.weather}
          maxLength={60}
          onBlur={(e) => setDeskPrefs({ weather: e.currentTarget.value })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      )}
      {status && (
        <small className="desk-weather-status" role="status">
          {status}
        </small>
      )}
      <small className="field-hint">
        Rain, snow, sun or stars around {me}, and the weather in his morning hello.{" "}
        {from === "auto"
          ? "Where you are is found on this computer: from Windows' location services if you allow them (Settings › Privacy › Location), rounded to about 10 km, or else from its time zone. Only that goes to Open-Meteo, to look up the weather."
          : from === "place"
            ? "The place you type is sent to Open-Meteo to look up its weather."
            : "Nothing is looked up while it's off."}
      </small>
    </div>
  );
}
