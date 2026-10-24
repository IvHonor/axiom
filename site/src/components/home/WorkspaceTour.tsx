"use client";

import { useRef, useState, type CSSProperties } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ArrowDown } from "lucide-react";
import { AREAS } from "@/lib/areas";
import { AppWindow, WINDOW_TABS, WINDOW_THEMES } from "./AppWindow";
import s from "./home.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

/** Motion allowed and not a very short (landscape phone) screen: pin the window and drive it with scroll. Otherwise it's a window with working tabs. */
const TOUR_QUERY = "(min-height: 500px) and (prefers-reduced-motion: no-preference)";
/** Scrolling per timeline second, in viewport heights: the tour's pace. Its length follows from the timeline. */
const SCROLL_PER_SECOND = 0.52;
/** Timeline seconds each area stays on screen. */
const AREA_TIME = 1.3;
/** Remembers, on this browser, that the visitor turned the animation off. */
const STILL_KEY = "axiom.site.still";
const readStill = () => { try { return localStorage.getItem(STILL_KEY) === "1"; } catch { return false; } };
const writeStill = (still: boolean) => { try { if (still) localStorage.setItem(STILL_KEY, "1"); else localStorage.removeItem(STILL_KEY); } catch {} };
/** Timeline seconds each theme stays on screen. */
const THEME_TIME = 0.45;

/** What each numbered part of the exploded window is. */
const PARTS = [
  { title: "Tabs", text: "Every area opens in its own tab, next to your overview." },
  { title: "Activity bar", text: "Areas, extensions, your account and themes, one click from anywhere." },
  { title: "Tiles", text: "Your overview is made of tiles. Move them, resize them, hide what you don't need." },
  { title: "Status bar", text: "Saved on your computer as you go. Sync and updates when you want them." },
];

/** The tour's stops: each window tab, then the themes. */
const THEMES_STOP = WINDOW_TABS.length;
const STOPS = [...WINDOW_TABS.map((tab) => tab.name), "Themes"];
const summary = (name: string) => AREAS.find((area) => area.name === name)?.summary ?? "";
const CAPTIONS = [
  "Your day, projects, reading, goals and money, all on one screen.",
  ...WINDOW_TABS.slice(1).map((tab) => summary(tab.name)),
  "Eight theme packs, twenty variants, dark and light. Change the look whenever you like.",
];

/**
 * The real Axiom window, opened up. Scrolling tilts it, takes it apart into its layers,
 * puts it back together, moves through its tabs, then flicks through themes. Native scrolling drives everything.
 */
export function WorkspaceTour() {
  const root = useRef<HTMLDivElement>(null);
  const tour = useRef<gsap.core.Timeline | null>(null);
  const shown = useRef({ stop: 0, theme: 0 });
  const [stop, setStop] = useState(0);
  const [theme, setTheme] = useState(0);
  /** The visitor turned the animation off (the plain window, with working tabs). */
  const [still, setStill] = useState(false);
  const [touring, setTouring] = useState(false);

  useGSAP(() => {
    const element = root.current!;
    if (still || readStill()) {
      if (!still) setStill(true);
      return;
    }
    const mm = gsap.matchMedia();
    mm.add(TOUR_QUERY, () => {
      element.dataset.mode = "tour";
      setTouring(true);
      const stage = element.querySelector<HTMLElement>("[data-stage]")!;
      const rig = element.querySelector<HTMLElement>("[data-rig]")!;
      const layers = gsap.utils.toArray<HTMLElement>("[data-layer]", element);
      const badges = gsap.utils.toArray<HTMLElement>("[data-badge]", element);
      const notes = gsap.utils.toArray<HTMLElement>("[data-note]", element);
      const dock = element.querySelector<HTMLElement>("[data-dock]")!;

      const tl = gsap.timeline({
        defaults: { duration: 1, ease: "power2.inOut" },
        onUpdate: () => {
          // What the window shows follows the playhead, forwards and backwards.
          const time = tl.time();
          const first = tl.labels["area-1"] - 0.2;
          let nextStop = 0;
          let nextTheme = 0;
          if (time >= tl.labels.themes - 0.1) {
            nextStop = THEMES_STOP;
            nextTheme = gsap.utils.clamp(0, WINDOW_THEMES.length - 1, Math.floor((time - tl.labels.themes) / THEME_TIME));
          } else if (time >= first) {
            nextStop = Math.min(WINDOW_TABS.length - 1, 1 + Math.floor((time - first) / AREA_TIME));
          }
          if (nextStop !== shown.current.stop || nextTheme !== shown.current.theme) {
            shown.current = { stop: nextStop, theme: nextTheme };
            setStop(nextStop);
            setTheme(nextTheme);
          }
        },
        scrollTrigger: {
          trigger: stage,
          start: "top top",
          end: () => `+=${Math.round(window.innerHeight * SCROLL_PER_SECOND * tl.duration())}`,
          pin: true,
          // The site header steps aside while the tour has the screen.
          onToggle: (self) => document.documentElement.toggleAttribute("data-tour", self.isActive),
          scrub: 1,
          invalidateOnRefresh: true,
        },
      });

      // 1. The window, tilted back like a drawing on a desk, comes upright.
      tl.fromTo(rig, { rotationX: 18, scale: 0.92, y: 24 }, { rotationX: 0, scale: 1, y: 0, duration: 0.8 }, 0);

      // 2. It comes apart: the camera turns to a technical view and each part lifts to its own depth.
      tl.addLabel("explode", 0.9)
        .to(rig, { rotationX: 52, rotationZ: -20, scale: 0.68, y: 14, duration: 1.4 }, "explode")
        .to(layers, { z: (_i, layer: HTMLElement) => Number(layer.dataset.depth), duration: 1.3, stagger: 0.05, ease: "power3.inOut" }, "explode+=0.15")
        .fromTo(badges, { opacity: 0, scale: 0.5 }, { opacity: 1, scale: 1, duration: 0.3, stagger: 0.08 }, "explode+=1")
        .to(dock, { autoAlpha: 0, duration: 0.3 }, "explode+=0.8")
        .fromTo(notes, { opacity: 0, x: (i) => (i < 2 ? -24 : 24) }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.12 }, "explode+=1");

      // 3. Back together.
      tl.addLabel("assemble", "explode+=2.7")
        .to(notes, { opacity: 0, duration: 0.4, stagger: 0.04 }, "assemble")
        .to(badges, { opacity: 0, duration: 0.3 }, "assemble")
        .to(dock, { autoAlpha: 1, duration: 0.3 }, "assemble+=0.3")
        .to(layers, { z: 0, duration: 1.1 }, "assemble+=0.1")
        .to(rig, { rotationX: 0, rotationZ: 0, scale: 1, y: 0, duration: 1.2 }, "assemble+=0.1");

      // 4. Through the tabs, with a slow drift so the window never sits completely still.
      for (let i = 1; i < WINDOW_TABS.length; i++) {
        tl.addLabel(`area-${i}`, i === 1 ? "assemble+=1.5" : `area-${i - 1}+=${AREA_TIME}`)
          .to(rig, { rotationY: i % 2 ? 3 : -3, rotationX: 3, duration: AREA_TIME, ease: "sine.inOut" }, `area-${i}`);
      }

      // 5. Back to the overview, flicking through themes: each one swings the window a little as it lands.
      tl.addLabel("themes", `area-${WINDOW_TABS.length - 1}+=${AREA_TIME}`)
        .to(rig, { rotationX: 0, rotationY: 0, scale: 0.97, duration: 0.5 }, "themes");
      for (let i = 1; i < WINDOW_THEMES.length; i++) {
        tl.addLabel(`theme-${i}`, `themes+=${i * THEME_TIME}`)
          .fromTo(rig, { rotationY: i % 2 ? -6 : 6 }, { rotationY: 0, duration: THEME_TIME * 0.7, ease: "power2.out", immediateRender: false }, `theme-${i}`);
      }

      // 6. It settles back as the page carries on.
      tl.to(rig, { rotationX: 10, scale: 0.92, duration: 0.8 }, `themes+=${WINDOW_THEMES.length * THEME_TIME}`);

      tour.current = tl;
      tl.scrollTrigger?.refresh(); // its length depends on the finished timeline
      return () => {
        tour.current = null;
        setTouring(false);
        document.documentElement.removeAttribute("data-tour");
        delete element.dataset.mode;
      };
    });
    document.fonts?.ready.then(() => ScrollTrigger.refresh());
    return () => mm.revert();
  }, { scope: root, dependencies: [still], revertOnUpdate: true });

  /** Jumps straight past the tour, to whatever comes after it. */
  function skip() {
    const scroll = tour.current?.scrollTrigger;
    if (scroll) window.scrollTo({ top: scroll.end + 1, behavior: "instant" });
  }

  function setMotion(on: boolean) {
    writeStill(!on);
    setStill(!on);
    requestAnimationFrame(() => root.current?.scrollIntoView({ behavior: "instant", block: "start" }));
  }

  /** Jumps to a stop: by scrolling when the tour is pinned, otherwise straight away. */
  function go(label: string, apply: () => void) {
    const scroll = tour.current?.scrollTrigger;
    if (scroll) window.scrollTo({ top: scroll.labelToScroll(label) + 40, behavior: "smooth" });
    else apply();
  }
  const showStop = (index: number) => go(index === 0 ? "explode" : index === THEMES_STOP ? "themes" : `area-${index}`, () => { setStop(index); setTheme(0); });
  const showTheme = (index: number) => go(index === 0 ? "themes" : `theme-${index}`, () => setTheme(index));

  const themed = stop === THEMES_STOP;
  return (
    <div ref={root} className={s.tour} id="tour">
      <div className={s.stage} data-stage>
        {touring && (
          <div className={s.skip}>
            <button type="button" onClick={skip}>Skip animation <ArrowDown size={13} /></button>
            <button type="button" onClick={() => setMotion(false)}>Turn animation off</button>
          </div>
        )}
        <div className={s.frame}>
          <div className={s.scene}>
            <div className={s.rig} data-rig><AppWindow active={themed ? 0 : stop} theme={themed ? WINDOW_THEMES[theme].id : undefined} choosingTheme={themed} /></div>
          </div>
        </div>
        <ol className={s.notes}>
          {PARTS.map((part, index) => <li key={part.title} className={s.note} data-note><span>0{index + 1}</span><h3>{part.title}</h3><p>{part.text}</p></li>)}
        </ol>
        <div className={`${s.dock} wrap`} data-dock>
          <nav className={s.areaTabs} aria-label="Show part of Axiom in the window">
            {STOPS.map((name, index) => <button key={name} type="button" aria-pressed={index === stop} onClick={() => showStop(index)}><span>0{index + 1}</span>{name}</button>)}
          </nav>
          <div className={s.captionBox} data-themed={themed} aria-live="polite">
            {themed && (
              <div className={s.themes} role="group" aria-label="Themes">
                {WINDOW_THEMES.map((option, index) => (
                  <button key={option.id} type="button" aria-pressed={index === theme} onClick={() => showTheme(index)} style={{ "--swatch-bg": option.swatch[0], "--swatch-accent": option.swatch[1] } as CSSProperties}>
                    <i />{option.name}
                  </button>
                ))}
              </div>
            )}
            <p className={s.caption}>{CAPTIONS[stop]}</p>
            {still && <button type="button" className={s.motionOn} onClick={() => setMotion(true)}>Turn the animation back on</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
