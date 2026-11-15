// Friends, for everyone with an account (not only those on the Playground's
// boards): your handle and code, adding people by handle or code, requests
// both ways, and your friends with their Lemmas, flames and a cheer each.
// Shown in the top bar's friends pop-out and the Playground's sidebar.
import { useState, type CSSProperties } from "react";
import { Check, RefreshCw, UserPlus, X, Zap } from "lucide-react";
import { ConfirmButton } from "../../shell/ui/ConfirmButton";
import { Flame, atRisk } from "./Flame";
import { glowOf, lemmaName } from "./PeerLemma";
import { Duo } from "./Duo";
import { FriendCode } from "./parts";
import * as api from "./api";
import { displayName, type Friend } from "./api";
import { HandleForm } from "./HandleForm";
import { Garden } from "./garden/Garden";
import { Modal } from "../../shell/ui/Modal";
import { refresh, setFriends, setMe, usePlayground } from "./store";

const CODE_SHAPE = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/;

/** `garden`: the garden's height above the list (0 leaves it out). */
export function FriendsPanel({ garden = 200 }: { garden?: number }) {
  const { me, friends, signedIn, error } = usePlayground();
  const [big, setBig] = useState(false);
  const [who, setWho] = useState("");
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  if (!signedIn) return <p className="pg-side-note">Sign in to add friends. Open Account, bottom left.</p>;
  if (me === undefined) return <p className="pg-side-note">{error ?? "Connecting…"}</p>;
  if (me === null) return <HandleForm />;

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      await refresh();
    } catch (e) {
      setNote({ text: String(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const text = who.trim();
    if (!text) return;
    // A friend code looks like ABCD-EFGH; anything else is a handle.
    const by = CODE_SHAPE.test(text) && !text.startsWith("@") ? { code: text } : { handle: text };
    void act(async () => {
      const added = await api.addFriend(by).catch(async (e) => {
        // "abcdefgh" could be either: try it as a handle too.
        if ("code" in by) return api.addFriend({ handle: text });
        throw e;
      });
      setWho("");
      setNote({ text: added.outcome === "friends" ? `You and ${displayName(added.player)} are friends!` : `Asked ${displayName(added.player)}. Over to them.`, ok: true });
    });
  };

  const cheer = (f: Friend) => {
    void api.cheer(f.player.userId).then(() => {
      if (friends) setFriends({ ...friends, friends: friends.friends.map((x) => (x.player.userId === f.player.userId ? { ...x, cheered: true } : x)) });
    }, (e) => setNote({ text: String(e), ok: false }));
  };

  return (
    <div className="pg-friends">
      {garden > 0 && <Garden height={garden} onExpand={() => setBig(true)} />}
      {big && (
        <Modal title="Your garden" onClose={() => setBig(false)} width={980} className="pg-modal gd-modal" bare>
          <div className="gd-modal-body">
            <Garden height={Math.min(560, Math.round(window.innerHeight * 0.66))} big />
            <p>Click a friend to say hello (not too often!), point at one to cheer them on, and click the grass to drop a data seed.</p>
          </div>
        </Modal>
      )}
      <section className="pg-side-you">
        <span className="pg-kicker">Your friend code</span>
        <FriendCode code={me.friendCode} handle={me.player.handle} />
        <ConfirmButton className="pg-link" onConfirm={() => void act(async () => setMe(await api.newCode()))} confirmText="Old code stops working. Sure?">
          <RefreshCw size={12} /> New code
        </ConfirmButton>
      </section>

      <form className="pg-add" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="@handle or friend code" aria-label="Add a friend by handle or friend code" spellCheck={false} autoComplete="off" />
        <button type="submit" disabled={busy || !who.trim()} aria-label="Add friend" title="Add friend"><UserPlus size={15} /></button>
      </form>
      {note && <p className={note.ok ? "pg-side-note is-ok" : "pg-error"} role="status">{note.text}</p>}

      {!!friends?.incoming.length && (
        <section>
          <h3 className="pg-side-head">Wants to be friends <b>{friends.incoming.length}</b></h3>
          <ul className="pg-people">
            {friends.incoming.map((r) => (
              <li key={r.player.userId} style={{ "--glow": glowOf(r.player) } as CSSProperties}>
                <Duo player={r.player} size={30} />
                <span className="pg-people-who"><strong>{displayName(r.player)}</strong><span>@{r.player.handle}</span></span>
                <button className="pg-icon is-yes" disabled={busy} onClick={() => void act(() => api.acceptFriend(r.player.userId))} aria-label={`Accept ${displayName(r.player)}`} title="Accept"><Check size={14} /></button>
                <button className="pg-icon" disabled={busy} onClick={() => void act(() => api.removeFriend(r.player.userId))} aria-label={`Decline ${displayName(r.player)}`} title="Decline"><X size={14} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="pg-side-head">Friends <b>{friends?.friends.length ?? 0}</b></h3>
        {friends?.friends.length ? (
          <ul className="pg-people">
            {friends.friends.map((f) => (
              <li key={f.player.userId} style={{ "--glow": glowOf(f.player) } as CSSProperties} data-cheered-you={f.cheeredYou || undefined}>
                <Duo player={f.player} size={30} />
                <span className="pg-people-who">
                  <strong>{displayName(f.player)}</strong>
                  <span>{f.cheeredYou ? <><Zap size={10} /> cheered you today</> : `@${f.player.handle} · ${lemmaName(f.player)}`}</span>
                </span>
                {!!f.streak && <Flame streak={f.streak} risk={atRisk(f.streakThrough, f.asOf)} size={14} />}
                <button className="pg-cheer" data-done={f.cheered || undefined} disabled={f.cheered} onClick={() => cheer(f)} aria-label={f.cheered ? "Cheered today" : `Cheer ${displayName(f.player)} on`} title={f.cheered ? "Cheered today" : "Cheer them on"}><Zap size={13} /></button>
                <ConfirmButton className="pg-icon pg-unfriend" onConfirm={() => void act(() => api.removeFriend(f.player.userId))} confirmText="Unfriend?"><X size={13} /></ConfirmButton>
              </li>
            ))}
          </ul>
        ) : <p className="pg-side-note">No friends yet. Share your code, or add someone by their @handle.</p>}
      </section>

      {!!friends?.outgoing.length && (
        <section>
          <h3 className="pg-side-head">Waiting on <b>{friends.outgoing.length}</b></h3>
          <ul className="pg-people">
            {friends.outgoing.map((r) => (
              <li key={r.player.userId} className="is-waiting">
                <Duo player={r.player} size={26} />
                <span className="pg-people-who"><strong>@{r.player.handle}</strong><span>Asked {new Date(r.sentAt).toLocaleDateString()}</span></span>
                <button className="pg-icon" disabled={busy} onClick={() => void act(() => api.removeFriend(r.player.userId))} aria-label={`Cancel request to ${r.player.handle}`} title="Cancel"><X size={13} /></button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
