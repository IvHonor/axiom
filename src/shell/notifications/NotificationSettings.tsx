import { AppWindow, Bell, Mail } from "lucide-react";
import { findExtension } from "../../extensions";
import { useNotificationSettings, type Channel, type NotificationKind, type NotificationSetting } from "../../lib/notifications";
import { Switch } from "../ui/Switch";

const CHANNELS: { id: Channel; label: string; icon: typeof Bell; field: keyof Omit<NotificationSetting, "kind"> }[] = [
  { id: "in_app", label: "In app", icon: Bell, field: "inApp" },
  { id: "desktop", label: "Desktop", icon: AppWindow, field: "desktop" },
  { id: "email", label: "Email", icon: Mail, field: "email" },
];

/** Each notification an extension (or several) sends, with a switch per channel. */
export function NotificationSettings({ extensions, signedIn, compact, quiet }: { extensions: string[]; signedIn: boolean; compact?: boolean; quiet?: boolean }) {
  const { kinds, settings, set, error } = useNotificationSettings();
  const shown = kinds.filter((k) => extensions.includes(k.extension));
  if (shown.length === 0) return quiet || kinds.length === 0 ? null : <p className="dim notify-empty">This extension doesn't send notifications.</p>;

  return (
    <div className={`notify-settings${compact ? " is-compact" : ""}`}>
      <div className="notify-head" aria-hidden>
        <span />
        {CHANNELS.map((c) => (
          <span key={c.id} className="notify-channel" title={c.label}>
            <c.icon size={13} strokeWidth={1.75} />
            {!compact && c.label}
          </span>
        ))}
      </div>
      {extensions
        .filter((id) => shown.some((k) => k.extension === id))
        .map((id) => (
          <div key={id} className="notify-group">
            {extensions.length > 1 && <div className="notify-group-name">{findExtension(id)?.name ?? id}</div>}
            {shown
              .filter((k) => k.extension === id)
              .map((kind) => (
                <Row key={kind.id} kind={kind} setting={settings.find((s) => s.kind === kind.id)} signedIn={signedIn} onSet={set} />
              ))}
          </div>
        ))}
      {!signedIn && shown.some((k) => k.email) && <p className="field-hint notify-note">Sign in to your Axiom account to get emails.</p>}
      {signedIn && shown.some((k) => k.email) && (
        <p className="field-hint notify-note">Emails are written by the Axiom server, so what's in them isn't end-to-end encrypted.</p>
      )}
      {error && <p className="account-error">{error}</p>}
    </div>
  );
}

function Row({
  kind,
  setting,
  signedIn,
  onSet,
}: {
  kind: NotificationKind;
  setting: NotificationSetting | undefined;
  signedIn: boolean;
  onSet: (kind: string, channel: Channel, on: boolean) => void;
}) {
  return (
    <div className="notify-row">
      <span className="notify-text">
        <span className="notify-label">{kind.label}</span>
        <span className="notify-desc">{kind.description}</span>
      </span>
      {CHANNELS.map((c) => {
        const emailOff = c.id === "email" && (!kind.email || !signedIn);
        const why = c.id === "email" && !kind.email ? "Not sent by email" : c.id === "email" && !signedIn ? "Sign in to get emails" : undefined;
        return (
          <span key={c.id} className="notify-switch">
            <Switch
              on={!!setting?.[c.field] && !emailOff}
              disabled={!setting || emailOff}
              label={`${kind.label}: ${c.label}`}
              title={why ?? `${c.label}: ${kind.label}`}
              onChange={(on) => onSet(kind.id, c.id, on)}
            />
          </span>
        );
      })}
    </div>
  );
}
