"use client";

// Installing Axiom from the website, as an app, with no app store: the
// browser's own prompt (Chrome, Edge, Android), the two steps on an iPhone
// or iPad (Safari's Share menu), or just opening it in the browser where
// neither applies. The app it installs is /terminal (public/manifest.webmanifest).
import { useEffect, useState } from "react";
import { ArrowRight, Check, Download, Share, SquarePlus, X } from "lucide-react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type State = "checking" | "prompt" | "ios" | "installed" | "browser";

function standalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function apple() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function InstallButton({ size = "lg", secondary = false }: { size?: "lg" | "md"; secondary?: boolean }) {
  const [state, setState] = useState<State>("checking");
  const [offered, setOffered] = useState<InstallPrompt | null>(null);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    // The service worker is what makes Axiom installable (and work offline).
    navigator.serviceWorker?.register("/sw.js", { scope: "/" }).catch(() => {});
    const offer = (event: Event) => {
      event.preventDefault();
      setOffered(event as InstallPrompt);
      setState("prompt");
    };
    const installed = () => setState("installed");
    window.addEventListener("beforeinstallprompt", offer);
    window.addEventListener("appinstalled", installed);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- what this browser offers is only known here
    setState(standalone() ? "installed" : apple() ? "ios" : "browser");
    return () => {
      window.removeEventListener("beforeinstallprompt", offer);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);

  const look = `button ${secondary ? "button-secondary" : "button-primary"} button-${size}`;

  if (state === "installed") {
    return <a className={look} href="/terminal"><Check size={15} /> Installed: open Axiom</a>;
  }
  if (state === "prompt" && offered) {
    return (
      <button className={look} onClick={async () => {
        await offered.prompt();
        const { outcome } = await offered.userChoice;
        setOffered(null);
        setState(outcome === "accepted" ? "installed" : "browser");
      }}>
        <Download size={15} /> Install Axiom
      </button>
    );
  }
  if (state === "ios") {
    return (
      <span className="install-wrap">
        <button className={look} onClick={() => setSteps(!steps)} aria-expanded={steps}>
          <Download size={15} /> Add to Home Screen
        </button>
        {steps && (
          <span className="install-steps" role="dialog" aria-label="Install Axiom on your iPhone or iPad">
            <button className="install-close" aria-label="Close" onClick={() => setSteps(false)}><X size={14} /></button>
            <span><Share size={16} /> In <b>Safari</b>, tap <b>Share</b>.</span>
            <span><SquarePlus size={16} /> Choose <b>Add to Home Screen</b>, then <b>Add</b>.</span>
            <small>Axiom opens from your home screen, full screen, and works offline.</small>
          </span>
        )}
      </span>
    );
  }
  return <a className={look} href="/terminal">Open in your browser <ArrowRight size={15} /></a>;
}
