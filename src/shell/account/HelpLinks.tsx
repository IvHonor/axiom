import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { LifeBuoy, ScrollText, ShieldCheck } from "lucide-react";
import { getAppStatus, type AppStatus } from "../../lib/backend";
import { SupportDialog } from "../support/Support";

function useAppInfo(): AppStatus | null {
  const [info, setInfo] = useState<AppStatus | null>(null);
  useEffect(() => void getAppStatus().then(setInfo, () => {}), []);
  return info;
}

/** Support and the privacy notice, at the foot of the Account panel. */
export function HelpLinks() {
  const info = useAppInfo();
  const [support, setSupport] = useState(false);
  return (
    <div className="help-links">
      <button className="link" onClick={() => setSupport(true)}>
        <LifeBuoy size={13} strokeWidth={1.75} /> Help and support
      </button>
      {support && <SupportDialog onClose={() => setSupport(false)} />}
      {info?.privacyUrl && (
        <button className="link" onClick={() => void openUrl(info.privacyUrl!)}>
          <ShieldCheck size={13} strokeWidth={1.75} /> Privacy notice
        </button>
      )}
      {info?.termsUrl && (
        <button className="link" onClick={() => void openUrl(info.termsUrl!)}>
          <ScrollText size={13} strokeWidth={1.75} /> Terms of use
        </button>
      )}
    </div>
  );
}

/** The privacy notice or terms, as a link in a sentence (the sign-up form). */
export function PageLink({ page, children }: { page: "privacy" | "terms"; children: string }) {
  const info = useAppInfo();
  const url = page === "privacy" ? info?.privacyUrl : info?.termsUrl;
  if (!url) return <>{children}</>;
  return (
    <button type="button" className="link" onClick={() => void openUrl(url)}>
      {children}
    </button>
  );
}
