import Link from "next/link";
import { ArrowDown, ArrowDownRight, ArrowUpRight, CloudOff, Code2, Globe2, LockKeyhole, MoveUpRight, Palette, ShieldCheck } from "lucide-react";
import { DownloadButton } from "@/components/Download";
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
            <div className={styles.actions}><DownloadButton /><Link className={styles.tourLink} href="#tour">SEE INSIDE <ArrowDown size={14} /></Link></div>
            <p className={styles.meta}><span>FREE & OPEN SOURCE</span><span>WINDOWS & MACOS</span><span>NO ACCOUNT NEEDED</span></p>
          </div>
        </div>
      </section>

      <WorkspaceTour />

      <div className="principles-strip"><div className="wrap"><span><LayoutMark /> One connected workspace</span><span><CloudOff size={15} /> Works offline</span><span><LockKeyhole size={15} /> Your data stays yours</span><span><Code2 size={15} /> Free. Open. Yours.</span></div></div>

      <section className="section" id="areas" aria-labelledby="areas-title">
        <div className="section-heading wrap"><div><span className="eyebrow"><span className="section-number">01 /</span> A PLACE FOR EVERY PART OF YOU</span><h2 id="areas-title">One life.<br />One connected workspace.</h2></div><p>Ten areas. One bigger picture. Bring in what you need and shape a space around the way you think.</p></div>
        <ol className={`${styles.areaList} wrap`}>
          {AREAS.map((area, index) => <li key={area.name} className={styles.area}><span>{String(index + 1).padStart(2, "0")}</span><h3><area.icon size={19} strokeWidth={1.4} />{area.name}</h3><p>{area.summary}</p>{area.encrypted ? <i title="End-to-end encrypted when synced"><LockKeyhole size={14} /><span className="sr-only">End-to-end encrypted when synced</span></i> : <i aria-hidden="true">↗</i>}</li>)}
        </ol>
        <div className="workspace-foot wrap"><span><LockKeyhole size={12} /> Finance, Notes, Journal, Goals and Birthdays are end-to-end encrypted when synced.</span><span>YOUR LIFE DOESN&apos;T FIT IN ONE CATEGORY. NEITHER DO WE.</span></div>
      </section>

      <section className="manifesto wrap" id="perspective" aria-labelledby="manifesto-title"><div className="section-tag"><span className="eyebrow">A CHANGE OF PERSPECTIVE</span><ArrowDownRight size={28} strokeWidth={1} /></div><div><h2 id="manifesto-title">You don&apos;t need a new life.<br /><span>Just a clearer view of this one.</span></h2><p>The deadline. The book you meant to finish. That idea you don&apos;t want to lose. Axiom gives it all a home, so you can spend less energy keeping up and more energy moving forward.</p></div></section>

      <section className="customise-section wrap" aria-labelledby="customise-title">
        <div className="customise-copy"><span className="eyebrow"><Palette size={13} /> BUILT AROUND YOU</span><h2 id="customise-title">Your space.<br />Your kind of order.</h2><p>Move the tiles. Change the theme. Keep the things that help, hide the things that don&apos;t. Axiom fits the way your mind works.</p><div className="customise-details"><span>08 <small>THEME PACKS</small></span><span>20 <small>VARIANTS</small></span></div></div>
        <div className="theme-study" aria-label="Axiom offers themes including Wireframe, Nord and Rose Pine"><div className="theme-window theme-window-back" aria-hidden="true"><div className="theme-window-bar"><span /> NORD <MoreDots /></div><div className="theme-mini-grid"><i /><i /><i /><i /></div></div><div className="theme-window theme-window-mid" aria-hidden="true"><div className="theme-window-bar"><span /> ROSÉ PINE <MoreDots /></div><div className="theme-mini-grid"><i /><i /><i /><i /></div></div><div className="theme-window theme-window-front" aria-hidden="true"><div className="theme-window-bar"><Mark size={12} /> WIREFRAME <MoreDots /></div><div className="theme-mini-grid"><div><span>DAILY PLAN</span><b>A clear day ahead.</b><i /><i /><i /></div><div><span>YOUR PROGRESS</span><div className="theme-ring">75<span>%</span></div></div><div><span>READING</span><b>One more chapter.</b></div><div><span>NOTES</span><b>Room for an idea.</b></div></div><div className="theme-window-footer">A WORKSPACE THAT FEELS LIKE YOU. <MoveUpRight size={12} /></div></div><span className="theme-caption">SAME LIFE. YOUR OWN PERSPECTIVE.</span></div>
      </section>

      <section className="section privacy-section wrap" id="privacy" aria-labelledby="privacy-title">
        <div className="privacy-seal" aria-hidden="true"><div className="privacy-seal-ring"><ShieldCheck size={60} strokeWidth={0.8} /></div><span>PRIVATE BY DESIGN</span><div className="barcode" /><small>YOUR LIFE IS NOT A DATASET.</small></div>
        <div className="privacy-copy"><span className="eyebrow"><span className="section-number">02 /</span> PERSONAL MEANS PERSONAL</span><h2 id="privacy-title">Your life.<br />Your data. Your call.</h2><p>Your workspace lives on your computer. Work offline, start without an account, and choose whether to sync. Your most personal areas are encrypted before they leave your device.</p><ul className="privacy-points"><li><CloudOff size={17} /><span>Local first. Ready when you are.</span></li><li><ShieldCheck size={17} /><span>End-to-end encryption for your personal areas.</span></li><li><Code2 size={17} /><span>No ads. No analytics. Open source.</span></li></ul><Link href="/privacy" className="text-link">Read our privacy promise <ArrowUpRight size={16} /></Link></div>
      </section>

      <section className="web-section wrap" id="web" aria-labelledby="web-title"><div className="web-icon"><Globe2 size={38} strokeWidth={1} /></div><div><span className="eyebrow">THE NEXT CHAPTER <span className="soon">COMING SOON</span></span><h2 id="web-title">Your life. Wherever it takes you.</h2><p>Axiom on the web is on its way. Your synced workspace, in your browser, for the moments you&apos;re away from your own computer.</p></div><span className="web-coordinate" aria-hidden="true">DESKTOP → EVERYWHERE</span></section>

      <section className="closing-section wrap" aria-labelledby="closing-title"><div className="closing-top"><span className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</span><span className="closing-asterisk" aria-hidden="true">✳</span></div><h2 id="closing-title">A little more order.<br /><span>A lot more life.</span></h2><div className="closing-bottom"><div><p>You don&apos;t have to have it all figured out.<br />Just give yourself somewhere to start.</p><span className="eyebrow">FREE FOR WINDOWS AND MAC. YOURS FROM DAY ONE.</span></div><DownloadButton /></div><div className="closing-baseline"><span>YOUR PERSONAL TERMINAL.</span><a href={REPO_URL}>BUILT IN THE OPEN <ArrowUpRight size={13} /></a><span>AXIOM / MAKE ROOM FOR WHAT MATTERS.</span></div></section>
    </>
  );
}

function LayoutMark() {
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" aria-hidden="true"><rect x="1" y="1" width="5" height="5" /><rect x="9" y="1" width="5" height="5" /><rect x="1" y="9" width="5" height="5" /><rect x="9" y="9" width="5" height="5" /></svg>;
}

function MoreDots() {
  return <span className="theme-dots">···</span>;
}
