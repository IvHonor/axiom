import Link from "next/link";
import { ArrowDown, ArrowDownRight, ArrowRight, ArrowUpRight, CloudOff, Code2, Globe2, Hand, LayoutGrid, LockKeyhole, Mic, Monitor, MonitorSmartphone, MonitorUp, MoveUpRight, Palette, RefreshCw, ShieldCheck, Smartphone, Smile, Sparkles, Timer, Zap } from "lucide-react";
import { DownloadButton } from "@/components/Download";
import { InstallButton } from "@/components/InstallApp";
import { Mark } from "@/components/Logo";
import { WorkspaceTour } from "@/components/home/WorkspaceTour";
import { AREAS } from "@/lib/areas";
import { REPO_URL } from "@/lib/release";
import styles from "@/components/home/home.module.css";

export default function Home() {
  return (
    <>
      <section className={`${styles.hero} wrap`} aria-labelledby="hero-title">
        <div className={styles.heroTop}><span><i className="status-dot" /> AXIOM / A PERSONAL TERMINAL FOR LIFE</span><span>AX—01 · EST. 2026</span></div>
        <div className={styles.heroGrid}>
          <div>
            <span className="eyebrow">LESS NOISE. MORE DIRECTION.</span>
            <h1 id="hero-title">Your life.<br />Back in <span>command.</span></h1>
          </div>
          <div>
            <p className={styles.lede}>Too many tabs. Too many loose ends. Bring your plans, projects, studies and everyday life into one personal terminal, and find your way forward.</p>
            <div className={styles.actions}><DownloadButton /><a className="button button-secondary button-lg" href="/terminal">Open in your browser <ArrowRight size={15} /></a><Link className={styles.tourLink} href="#everywhere">ON EVERY SCREEN <ArrowDown size={14} /></Link></div>
            <p className={styles.meta}><span>FREE & OPEN SOURCE</span><span>WINDOWS & MACOS</span><span>ANY BROWSER</span><span>INSTALLS ON YOUR PHONE</span></p>
          </div>
        </div>
      </section>

      <WorkspaceTour />

      <div className="principles-strip"><div className="wrap"><span><LayoutMark /> One connected workspace</span><span><MonitorSmartphone size={15} /> Desktop, browser and phone</span><span><CloudOff size={15} /> Works offline</span><span><LockKeyhole size={15} /> Your data stays yours</span><span><Code2 size={15} /> Free. Open. Yours.</span></div></div>

      <section className="section" id="areas" aria-labelledby="areas-title">
        <div className="section-heading wrap"><div><span className="eyebrow"><span className="section-number">01 /</span> A PLACE FOR EVERY PART OF YOU</span><h2 id="areas-title">One life.<br />One connected workspace.</h2></div><p>Ten areas. One bigger picture. Bring in what you need and shape a space around the way you think.</p></div>
        <ol className={`${styles.areaList} wrap`}>
          {AREAS.map((area, index) => <li key={area.name} className={styles.area}><span>{String(index + 1).padStart(2, "0")}</span><h3><area.icon size={19} strokeWidth={1.4} />{area.name}</h3><p>{area.summary}</p>{area.encrypted ? <i title="End-to-end encrypted when synced"><LockKeyhole size={14} /><span className="sr-only">End-to-end encrypted when synced</span></i> : <i aria-hidden="true">↗</i>}</li>)}
        </ol>
        <div className="workspace-foot wrap"><span><LockKeyhole size={12} /> Finance, Notes, Journal, Goals and Birthdays are end-to-end encrypted when synced.</span><span>YOUR LIFE DOESN&apos;T FIT IN ONE CATEGORY. NEITHER DO WE.</span></div>
      </section>

      <section className="section" id="lemma" aria-labelledby="lemma-title">
        <div className="section-heading wrap"><div><span className="eyebrow"><span className="section-number">02 /</span> MEET LEMMA, YOUR ASSISTANT</span><h2 id="lemma-title">A hand when you want one.<br />Out of the way when you don&apos;t.</h2></div><p>Lemma knows the areas you let it see, and nothing more. Ask in your own words, confirm what it suggests, and let it sit on your desktop to keep time and keep you on track.</p></div>
        <ol className={`${styles.areaList} wrap`}>
          {LEMMA.map((point, index) => <li key={point.title} className={styles.area}><span>{String(index + 1).padStart(2, "0")}</span><h3><point.icon size={19} strokeWidth={1.4} />{point.title}</h3><p>{point.text}</p><i aria-hidden="true">↗</i></li>)}
        </ol>
        <div className="workspace-foot wrap"><span><Sparkles size={12} /> Lemma on your desktop is optional: turn it on, or off, in Lemma&apos;s settings.</span><span>FREE WITH YOUR AXIOM ACCOUNT.</span></div>
      </section>

      <section className="manifesto wrap" id="perspective" aria-labelledby="manifesto-title"><div className="section-tag"><span className="eyebrow">A CHANGE OF PERSPECTIVE</span><ArrowDownRight size={28} strokeWidth={1} /></div><div><h2 id="manifesto-title">You don&apos;t need a new life.<br /><span>Just a clearer view of this one.</span></h2><p>The deadline. The book you meant to finish. That idea you don&apos;t want to lose. Axiom gives it all a home, so you can spend less energy keeping up and more energy moving forward.</p></div></section>

      <section className="customise-section wrap" aria-labelledby="customise-title">
        <div className="customise-copy"><span className="eyebrow"><Palette size={13} /> BUILT AROUND YOU</span><h2 id="customise-title">Your space.<br />Your kind of order.</h2><p>Move the tiles. Change the theme. Keep the things that help, hide the things that don&apos;t. Axiom fits the way your mind works.</p><div className="customise-details"><span>08 <small>THEME PACKS</small></span><span>20 <small>VARIANTS</small></span></div></div>
        <div className="theme-study" aria-label="Axiom offers themes including Wireframe, Nord and Rose Pine"><div className="theme-window theme-window-back" aria-hidden="true"><div className="theme-window-bar"><span /> NORD <MoreDots /></div><div className="theme-mini-grid"><i /><i /><i /><i /></div></div><div className="theme-window theme-window-mid" aria-hidden="true"><div className="theme-window-bar"><span /> ROSÉ PINE <MoreDots /></div><div className="theme-mini-grid"><i /><i /><i /><i /></div></div><div className="theme-window theme-window-front" aria-hidden="true"><div className="theme-window-bar"><Mark size={12} /> WIREFRAME <MoreDots /></div><div className="theme-mini-grid"><div><span>DAILY PLAN</span><b>A clear day ahead.</b><i /><i /><i /></div><div><span>YOUR PROGRESS</span><div className="theme-ring">75<span>%</span></div></div><div><span>READING</span><b>One more chapter.</b></div><div><span>NOTES</span><b>Room for an idea.</b></div></div><div className="theme-window-footer">A WORKSPACE THAT FEELS LIKE YOU. <MoveUpRight size={12} /></div></div><span className="theme-caption">SAME LIFE. YOUR OWN PERSPECTIVE.</span></div>
      </section>

      <section className="section privacy-section wrap" id="privacy" aria-labelledby="privacy-title">
        <div className="privacy-seal" aria-hidden="true"><div className="privacy-seal-ring"><ShieldCheck size={60} strokeWidth={0.8} /></div><span>PRIVATE BY DESIGN</span><div className="barcode" /><small>YOUR LIFE IS NOT A DATASET.</small></div>
        <div className="privacy-copy"><span className="eyebrow"><span className="section-number">03 /</span> PERSONAL MEANS PERSONAL</span><h2 id="privacy-title">Your life.<br />Your data. Your call.</h2><p>Your workspace lives on your own devices: your computer, and your phone if you install it there. Work offline, start without an account, and choose whether to sync. Your most personal areas are encrypted before they leave your device.</p><ul className="privacy-points"><li><CloudOff size={17} /><span>Local first. Ready when you are.</span></li><li><ShieldCheck size={17} /><span>End-to-end encryption for your personal areas.</span></li><li><Code2 size={17} /><span>No ads. No analytics. Open source.</span></li></ul><Link href="/privacy" className="text-link">Read our privacy promise <ArrowUpRight size={16} /></Link></div>
      </section>

      <section className="section" id="everywhere" aria-labelledby="everywhere-title">
        <div className="section-heading wrap"><div><span className="eyebrow"><span className="section-number">04 /</span> EVERYWHERE YOU ARE <span className="soon">NEW</span></span><h2 id="everywhere-title">One workspace.<br />Every screen you own.</h2></div><p>The same Axiom on your desktop, in your browser and on your phone: not a lighter copy. Your areas, themes and layout follow you, and every change syncs.</p></div>
        <div className={`${styles.everywhere} wrap`}>
          <ol className={styles.ways}>
            {WAYS.map((way, index) => (
              <li key={way.title} className={styles.way}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3><way.icon size={19} strokeWidth={1.4} />{way.title}</h3>
                <p>{way.text}</p>
                <div className={styles.wayAction}>{way.action}</div>
              </li>
            ))}
          </ol>
          <PhoneSketch />
        </div>
        <ul className={`${styles.features} wrap`}>
          {EVERYWHERE.map((feature) => <li key={feature.title}><feature.icon size={16} strokeWidth={1.5} /><div><b>{feature.title}</b><span>{feature.text}</span></div></li>)}
        </ul>
        <div className="workspace-foot wrap"><span><LockKeyhole size={12} /> Finance, Notes, Journal, Goals and Birthdays stay end-to-end encrypted. For now they open in the desktop app; the browser unlocks them soon.</span><span>NO APP STORE. NO WAITING.</span></div>
      </section>

      <section className="closing-section wrap" aria-labelledby="closing-title"><div className="closing-top"><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><span className="closing-asterisk" aria-hidden="true">✳</span></div><h2 id="closing-title">A little more order.<br /><span>A lot more life.</span></h2><div className="closing-bottom"><div><p>You don&apos;t have to have it all figured out.<br />Just give yourself somewhere to start.</p><span className="eyebrow">FREE ON WINDOWS, MAC, YOUR BROWSER AND YOUR PHONE. YOURS FROM DAY ONE.</span></div><div className={styles.closingActions}><DownloadButton /><InstallButton secondary /></div></div><div className="closing-baseline"><span>YOUR PERSONAL TERMINAL.</span><a href={REPO_URL}>BUILT IN THE OPEN <ArrowUpRight size={13} /></a><span>AXIOM / MAKE ROOM FOR WHAT MATTERS.</span></div></section>
    </>
  );
}

/** The ways into Axiom, for the "Everywhere you are" section. */
const WAYS = [
  { icon: Monitor, title: "The desktop app", text: "Windows and macOS. Everything on your own computer, Lemma on your desktop, and no account needed to start.", action: <DownloadButton size="md" /> },
  { icon: Globe2, title: "In your browser", text: "Sign in from any computer and pick up where you left off: the whole workspace, with your themes and layout, in a tab.", action: <a className="button button-secondary button-md" href="/terminal">Open in your browser <ArrowRight size={14} /></a> },
  { icon: Smartphone, title: "On your phone", text: "Add Axiom to your home screen. It opens full screen with a layout made for your thumb, and keeps working without a signal.", action: <InstallButton size="md" secondary /> },
  { icon: MonitorUp, title: "Installed from your browser", text: "Chrome and Edge install it on any computer, in its own window with its own icon: handy on a laptop where you can't install software.", action: <span className={styles.wayHint}>Look for Install in the address bar</span> },
];

/** What's new about using Axiom anywhere. */
const EVERYWHERE = [
  { icon: RefreshCw, title: "Settings that follow you", text: "Theme, overview layout, extensions, Lemma's look, even where you put Lemma: change them once, on any device." },
  { icon: CloudOff, title: "Works offline", text: "Opens without a connection. What you change waits safely on the device and syncs when you're back." },
  { icon: Zap, title: "No app store", text: "Install it straight from your browser in a few seconds. It updates itself the next time it's online." },
  { icon: Smartphone, title: "Made for phones", text: "A bottom bar, cards two to a row, menus that rise from the bottom, and a sidebar you swipe in from the edge." },
  { icon: LayoutGrid, title: "Tablets and landscape", text: "Four cards across, a sidebar that slides over what you're doing, and room to work held either way." },
  { icon: Hand, title: "Shortcuts on the icon", text: "Press and hold the app icon to jump straight to Today, your Project Board, Reading or University." },
];

/** What Lemma does, for the home page (in step with the app's own "What's new"). */
const LEMMA = [
  { icon: Sparkles, title: "Ask in your own words", text: "Plan your day, add a birthday, log a book or see where your money went. Every change waits for your OK, and can be undone." },
  { icon: MonitorUp, title: "On your desktop", text: "A small companion over your other apps, or tucked into the edge of your screen: your timer, your next meeting with Join, your reminders. It stays when Axiom closes." },
  { icon: Mic, title: "Talk or type", text: "Double-click to talk, or type. Small things happen straight away, each with an Undo, and nothing you say there is kept. Drop a link or a note on it to keep it." },
  { icon: Timer, title: "Focus, looked after", text: "Focus rounds and breaks, a nudge when time's up, a quiet word when you've been away, and it keeps out of the way during full-screen apps and calls." },
  { icon: Smile, title: "A personality of its own", text: "Choose its name, look and personality. It talks your way, reacts to what you do, plays about when left alone, and can show the weather where you are." },
  { icon: ShieldCheck, title: "Private by default", text: "Lemma sees nothing until you switch an area on, only uses AI when you ask it something, and your chats stay on your computer, synced end-to-end encrypted." },
];

/** A phone running Axiom: the two-up overview and the bottom bar. Drawn, not a screenshot. */
function PhoneSketch() {
  return (
    <figure className={styles.phone} aria-label="Axiom on a phone: cards two to a row, and a bar of areas along the bottom">
      <div className={styles.phoneScreen} aria-hidden="true">
        <div className={styles.phoneBar}><Mark size={10} /><span>Overview</span></div>
        <div className={styles.phoneDate}>SUNDAY 8 NOVEMBER</div>
        <div className={styles.phoneCards}>
          <div className={styles.phoneWide}><b>Daily Plan</b><i /><i /><i /></div>
          <div><b>Reading</b><span className={styles.phoneRing}>62%</span></div>
          <div><b>University</b><small>2 behind</small></div>
          <div><b>Learning</b><small>30 min today</small></div>
          <div><b>Board</b><small>4 open</small></div>
        </div>
        <div className={styles.phoneNav}><i /><i /><i /><i /><i /><i /></div>
      </div>
      <figcaption>INSTALLED FROM THE BROWSER. NO APP STORE.</figcaption>
    </figure>
  );
}

function LayoutMark() {
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" aria-hidden="true"><rect x="1" y="1" width="5" height="5" /><rect x="9" y="1" width="5" height="5" /><rect x="1" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" /></svg>;
}

function MoreDots() {
  return <span className="theme-dots">···</span>;
}
