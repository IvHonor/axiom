import type { Metadata } from "next";
import Link from "next/link";
import { REPO_URL } from "@/lib/release";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Axiom: answers to common questions, and how to reach us.",
};

export default function SupportPage() {
  return (
    <article className="page wrap">
      <h1>Support</h1>
      <p className="page-lede">
        The quickest way to reach us is the <b>support button</b> in Axiom, the lifebuoy at the top right. It includes your version, and we reply by email. You can also write to{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>

      <h2>Common questions</h2>
      <div className="faq">
        <details>
          <summary>macOS says it can&apos;t check the developer</summary>
          <p>
            Axiom isn&apos;t notarised by Apple yet. Open <b>System Settings → Privacy &amp; Security</b>, scroll down and choose <b>Open Anyway</b>. You only need to do this once. See{" "}
            <Link href="/download">Download</Link>.
          </p>
        </details>
        <details>
          <summary>Windows says &ldquo;Windows protected your PC&rdquo;</summary>
          <p>
            The installer isn&apos;t code-signed yet. Choose <b>More info</b>, then <b>Run anyway</b>. See <Link href="/download">Download</Link> for more.
          </p>
        </details>
        <details>
          <summary>Do I need an account?</summary>
          <p>No. Everything works on your computer without one. An account lets Axiom sync between your computers, share project boards, and send reminder emails if you want them.</p>
        </details>
        <details>
          <summary>I didn&apos;t get my confirmation or reset code</summary>
          <p>Codes arrive within a minute or two and work for 30 minutes. Check your spam folder, then ask for a new one in the app. You can ask for a few an hour.</p>
        </details>
        <details>
          <summary>I reset my password and my finances or journal won&apos;t unlock</summary>
          <p>
            Encrypted areas are locked with your password, and a reset can&apos;t recover them on a new computer. Enter the <b>recovery code</b> you saved when you set up encryption. A
            computer that was already unlocked keeps working, and can show the code under <b>Account → Encryption</b>.
          </p>
        </details>
        <details>
          <summary>I forgot my PIN</summary>
          <p>
            On the lock screen, choose <b>Forgot PIN?</b>. We&apos;ll email a code to your account; entering it turns the PIN lock off so you can choose a new one.
          </p>
        </details>
        <details>
          <summary>How do I back up or move my data?</summary>
          <p>
            <b>Account → Your data → Export my data</b> saves everything on your computer as a file. With an account, your synced data also comes back when you sign in on another
            computer.
          </p>
        </details>
        <details>
          <summary>How do I delete my account?</summary>
          <p>
            <b>Account → Danger zone → Delete account</b>. It deletes your account and everything synced to it. The copy on your computer stays. See the{" "}
            <Link href="/privacy">privacy notice</Link>.
          </p>
        </details>
        <details>
          <summary>I found a bug, or have an idea</summary>
          <p>
            Use the support button in Axiom and choose &ldquo;Something&apos;s broken&rdquo; or &ldquo;An idea&rdquo;. Developers can also open an issue on <a href={`${REPO_URL}/issues`}>GitHub</a>.
          </p>
        </details>
      </div>
    </article>
  );
}
