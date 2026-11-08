// Installing Axiom on the web as an app: a banner on the overview (until
// it's installed or put away), a line in the Account panel that's always
// there, and the steps for an iPhone or iPad. Nothing in the desktop app.
import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { installApp, useInstallState } from "../lib/install";
import { isWeb } from "../lib/platform";
import { usePersistentState } from "./usePersistentState";
import { Logo } from "./ui/Logo";
import { Modal } from "./ui/Modal";

/** iPhone and iPad: Safari's Share menu, then Add to Home Screen. */
function AppleSteps({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Install Axiom" icon={<Download size={16} strokeWidth={1.75} />} onClose={onClose}>
      <ol className="install-steps">
        <li>
          <Share size={18} strokeWidth={1.75} />
          <span>
            In <b>Safari</b>, tap <b>Share</b> (the square with an arrow, at the bottom or top of the screen).
          </span>
        </li>
        <li>
          <SquarePlus size={18} strokeWidth={1.75} />
          <span>
            Choose <b>Add to Home Screen</b>, then <b>Add</b>.
          </span>
        </li>
        <li>
          <Logo size={18} />
          <span>Open Axiom from your home screen: full screen, and it works offline.</span>
        </li>
      </ol>
      <p className="field-hint">On an iPhone or iPad only Safari can add apps to the home screen.</p>
    </Modal>
  );
}

/** The button: the browser's own prompt where there is one, the steps on an iPhone. */
function useInstall() {
  const state = useInstallState();
  const [steps, setSteps] = useState(false);
  const start = () => (state === "ios" ? setSteps(true) : void installApp());
  const dialog = steps ? <AppleSteps onClose={() => setSteps(false)} /> : null;
  return { state, start, dialog };
}

/** On the overview, until Axiom's installed or the banner's put away. */
export function InstallBanner() {
  const { state, start, dialog } = useInstall();
  const [dismissed, setDismissed] = usePersistentState<boolean>("axiom.install.dismissed", (saved) => saved === true);
  if (!isWeb || dismissed || (state !== "prompt" && state !== "ios")) return dialog;
  return (
    <>
      <div className="install-banner" role="region" aria-label="Install Axiom">
        <Logo size={22} />
        <span>
          <b>Install Axiom</b> Opens like an app, full screen, and works offline. No app store.
        </span>
        <button className="btn btn-sm" onClick={start}>
          Install
        </button>
        <button className="icon-btn" aria-label="Not now" title="Not now" onClick={() => setDismissed(true)}>
          <X size={14} strokeWidth={1.75} />
        </button>
      </div>
      {dialog}
    </>
  );
}

/** In the Account panel: always findable, after the banner's gone. */
export function InstallCard() {
  const { state, start, dialog } = useInstall();
  if (!isWeb) return null;
  return (
    <>
      {state === "installed" ? (
        <p className="field-hint">Axiom is installed on this device. It opens full screen and works offline.</p>
      ) : state === "unavailable" ? (
        <p className="field-hint">
          Install Axiom from your browser&apos;s menu (Install app, or Add to Home Screen) to open it like an app and use it offline.
        </p>
      ) : (
        <>
          <p className="field-hint">Open Axiom like an app, full screen, and use it offline. No app store needed.</p>
          <button className="btn btn-sm" onClick={start}>
            <Download size={13} strokeWidth={1.75} /> Install Axiom
          </button>
        </>
      )}
      {dialog}
    </>
  );
}
