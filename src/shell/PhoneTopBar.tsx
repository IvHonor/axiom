// The top bar on a phone. A row of desktop tabs took the whole width and
// still only showed one or two; here it's the logo, what's open (with how
// many tabs are), support and notifications. Tapping what's open lists every
// open tab, to switch to or close.
import { useState } from "react";
import { Check, ChevronDown, Layers, X } from "lucide-react";
import { findExtension } from "../extensions";
import { NotificationBell } from "./notifications/NotificationBell";
import { SupportButton } from "./support/Support";
import { ExtensionIcon } from "./ui/ExtensionIcon";
import { Logo } from "./ui/Logo";
import { Modal } from "./ui/Modal";
import { OVERVIEW, sameView, viewKey, type View } from "./view";
import type { LucideIcon } from "lucide-react";

interface PhoneTopBarProps {
  tabs: View[];
  active: View;
  onSelect: (view: View) => void;
  onClose: (view: View) => void;
  describe: (view: View) => { label: string; icon: LucideIcon };
}

export function PhoneTopBar({ tabs, active, onSelect, onClose, describe }: PhoneTopBarProps) {
  const [listing, setListing] = useState(false);
  const icon = (view: View, size: number) => {
    const ext = view.kind === "extension" || view.kind === "extension-info" ? findExtension(view.id) : undefined;
    const Icon = describe(view).icon;
    return ext ? <ExtensionIcon ext={ext} size={size} /> : <Icon size={size} strokeWidth={1.5} />;
  };
  const current = describe(active);

  return (
    <header className="topbar topbar-phone">
      <button className="topbar-logo" onClick={() => onSelect(OVERVIEW)} title="Overview" aria-label="Overview">
        <Logo />
      </button>
      <button className="phone-view" onClick={() => setListing(true)} aria-haspopup="dialog" aria-label={`${current.label}. ${tabs.length} open tab${tabs.length === 1 ? "" : "s"}: show them`}>
        {icon(active, 16)}
        <span className="phone-view-label">{current.label}</span>
        {tabs.length > 1 && <span className="phone-view-count">{tabs.length}</span>}
        <ChevronDown size={14} strokeWidth={1.75} />
      </button>
      <SupportButton />
      <NotificationBell onOpen={(id) => onSelect({ kind: "extension", id })} />
      {listing && (
        <Modal title="Open tabs" icon={<Layers size={16} strokeWidth={1.75} />} onClose={() => setListing(false)}>
          <ul className="phone-tabs" role="list">
            {tabs.map((view) => {
              const { label } = describe(view);
              const selected = sameView(view, active);
              return (
                <li key={viewKey(view)} className={selected ? "is-active" : undefined}>
                  <button className="phone-tab" onClick={() => { onSelect(view); setListing(false); }} aria-current={selected ? "page" : undefined}>
                    {icon(view, 18)}
                    <span>{label}</span>
                    {selected && <Check size={16} strokeWidth={1.75} className="phone-tab-check" />}
                  </button>
                  {view.kind !== "overview" && (
                    <button className="icon-btn" aria-label={`Close ${label}`} onClick={() => onClose(view)}>
                      <X size={16} strokeWidth={1.75} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </header>
  );
}
