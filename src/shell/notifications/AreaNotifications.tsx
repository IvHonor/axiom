import { useEffect, useState } from "react";
import { notificationKinds } from "../../lib/notifications";
import { Section } from "../ui/Section";
import { NotificationSettings } from "./NotificationSettings";

/** A Notifications section at the foot of an extension's side panel, for
 * extensions that send any. */
export function AreaNotifications({ extension, signedIn }: { extension: string; signedIn: boolean }) {
  const [sends, setSends] = useState(false);
  useEffect(() => {
    notificationKinds().then((kinds) => setSends(kinds.some((k) => k.extension === extension)), () => setSends(false));
  }, [extension]);
  if (!sends) return null;
  return (
    <Section title="Notifications">
      <div className="notify-sidebar">
        <NotificationSettings extensions={[extension]} signedIn={signedIn} compact quiet />
      </div>
    </Section>
  );
}
