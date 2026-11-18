import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { listDevices, signOutDevice, type Device } from "../../lib/account";
import { ago } from "../format";
import { useNow } from "../useSync";
import { ErrorNote, useAction } from "./fields";

/** Every computer signed in to the account; any but this one can be signed out from here. */
export function DeviceList() {
  const now = useNow();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const { busy, error, run } = useAction();

  const load = () => run(() => listDevices().then(setDevices));
  useEffect(() => void load(), []);

  const signOut = (id: string) => run(() => signOutDevice(id).then(() => listDevices().then(setDevices)));

  return (
    <>
      {devices && (
        <ul className="device-list">
          {devices.map((d) => (
            <li key={d.id} className="device">
              <Monitor size={16} strokeWidth={1.5} className="device-icon" />
              <span className="device-text">
                <span className="device-name" title={d.name}>
                  {d.name}
                </span>
                <span className="ext-meta">{d.current ? "This computer" : `Active ${ago(d.lastActiveAt, now)}`}</span>
              </span>
              {!d.current && (
                <button className="btn btn-sm btn-ghost" onClick={() => void signOut(d.id)} disabled={busy}>
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {devices && <p className="field-hint">Up to 20 devices stay signed in. Signing in somewhere new signs out the one used least recently.</p>}
      {!devices && !error && <p className="field-hint">Loading devices…</p>}
      <ErrorNote error={error} />
      {error && (
        <button className="link" onClick={() => void load()}>
          Try again
        </button>
      )}
    </>
  );
}
