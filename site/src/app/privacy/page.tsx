import type { Metadata } from "next";
import { CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR_NAME, RETENTION } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy notice",
  description: "What Axiom keeps, where, for how long, and your rights over it.",
};

// Keep in step with the server's copy, server/src/privacy.rs.
export default function PrivacyPage() {
  const contact = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
  return (
    <article className="page wrap">
      <h1>Privacy notice</h1>
      <p className="muted">Last updated {LEGAL_UPDATED}</p>
      <p>
        Axiom keeps your data on your own computer. You don&apos;t need an account to use it. This notice covers what happens when you do create one, when you write to support, and the
        few outside services the app talks to.
      </p>
      <p>
        {OPERATOR_NAME && <>Axiom is run by {OPERATOR_NAME}. </>}For anything about your data, email {contact}.
      </p>

      <h2>Without an account</h2>
      <p>Everything stays in a database on your computer. Nothing is sent to the Axiom server, unless you write to support.</p>

      <h2>What the Axiom server keeps if you have an account</h2>
      <ul>
        <li>
          <b>Your account:</b> your email address, and a one-way hash of a key your computer makes from your password. Your password itself never reaches the server. Also the name and
          picture you choose (if any), and when you signed up and confirmed your email.
        </li>
        <li>
          <b>Your devices:</b> each computer&apos;s name (for example &ldquo;DESKTOP-4F2 (Windows)&rdquo; or &ldquo;Ada&apos;s MacBook (macOS)&rdquo;) and when it was last active, so you can sign devices out.
        </li>
        <li>
          <b>Synced data:</b> a copy of what you sync, so your other computers can catch up.
          <ul>
            <li>
              <b>End-to-end encrypted:</b> Finance, Journal, Notes, Birthdays and Goals are encrypted on your computer before they&apos;re sent. The server stores them but can&apos;t read
              them. It only sees which kind of record it is, its ID, and when it changed.
            </li>
            <li>
              <b>Not end-to-end encrypted:</b> Project Board, Daily Plan, Reading, University, Learning and your settings are stored as they are. They&apos;re protected in transit and by
              access controls, and could be read by whoever runs the server.
            </li>
          </ul>
        </li>
        <li>
          <b>Shared boards:</b> boards you share are visible to the people on them. Invitations keep the invited email address until they&apos;re accepted, declined or withdrawn.
        </li>
        <li>
          <b>Notification emails:</b> if you switch on emails, the server keeps each planned email&apos;s contents until it&apos;s sent. Emails aren&apos;t end-to-end encrypted. Finance
          amounts are never emailed.
        </li>
        <li>
          <b>Codes:</b> codes for confirming your email, resetting your password or turning off the PIN lock are stored only as hashes, and expire after 30 minutes.
        </li>
        <li>
          <b>Support messages:</b> what you write to support, the email address to reply to, and your Axiom version. Each one is kept so we can follow it up, and emailed to our support
          inbox. You can send one without an account.
        </li>
        <li>
          <b>Axiom on the web list:</b> if you ask to hear when Axiom on the web opens, your email address and when you asked. We&apos;ll use it for that one email, then delete
          the list. Write to us to be taken off it sooner; deleting your account does it too.
        </li>
      </ul>
      <p>
        Your IP address is used briefly, in memory, to limit repeated sign-in attempts. It isn&apos;t saved with your account, though our hosting provider may keep standard request logs.
      </p>
      <p>Axiom has no ads and no analytics or tracking, and your data is never sold. This website only uses cookies when you sign in: two essential cookies that keep you signed in on this browser, which signing out removes.</p>

      <h2>Why we use it (our lawful bases)</h2>
      <ul>
        <li>
          <b>To provide the service you asked for</b> (performance of a contract): your account, syncing, shared boards, and the codes for confirming your email or resetting your password.
        </li>
        <li>
          <b>Because you chose it</b> (consent): notification emails, and the Axiom on the web list. Switch emails off at any time, in the app or with the link in each email.
        </li>
        <li>
          <b>Legitimate interests:</b> keeping the service secure (rate limits and backups), answering support messages, and keeping a short record of them.
        </li>
      </ul>

      <h2>Who processes it</h2>
      <ul>
        <li>
          <b>Render</b> hosts the server, in the United States (Ohio).
        </li>
        <li>
          <b>Neon</b> hosts the database, in the United States (Ohio).
        </li>
        <li>
          <b>Resend</b> delivers emails: confirmation and reset codes, board invitations, support messages and replies, and notifications you&apos;ve switched on.
        </li>
        <li>
          <b>GitHub</b> keeps encrypted nightly backups of the database for 30 days, and hosts the downloads.
        </li>
        <li>
          <b>Vercel</b> hosts this website.
        </li>
      </ul>
      <p>
        This means your account data is stored in the United States. Each of these providers processes it only on our instructions, under data processing terms. Transfers out of the UK
        are protected by the safeguards in those terms: the UK&apos;s International Data Transfer Addendum, or the UK–US data bridge where the provider is certified.
      </p>

      <h2>Services the app contacts directly</h2>
      <p>These go straight from your computer, never through the Axiom server, and only when you use the feature:</p>
      <ul>
        <li>
          <b>Open Library</b> (openlibrary.org), to search for books and show covers in Reading and Learning.
        </li>
        <li>
          <b>YouTube</b> (Google), to read a playlist&apos;s videos when you import one into Learning. Only the playlist link is sent.
        </li>
        <li>
          <b>Frankfurter</b> (frankfurter.dev), for currency exchange rates in Finance. Only currency codes and dates are sent.
        </li>
        <li>
          <b>Google, Microsoft, iCloud or Fastmail</b>, if you connect a calendar to Daily Plan. Your calendar events stay on your computer: they aren&apos;t synced or sent to the Axiom
          server. Sign-in tokens are kept in your computer&apos;s credential store. Axiom&apos;s use of information received from Google APIs adheres to the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.
        </li>
        <li>
          <b>GitHub</b>, to check for and download Axiom updates.
        </li>
      </ul>

      <h2>How long it&apos;s kept</h2>
      <ul>
        <li>Your account and everything synced to it: until you delete your account. Copies in backups are gone within 30 days after that.</li>
        <li>Sign-ups that never confirmed their email: {RETENTION.unconfirmedDays} days.</li>
        <li>A device&apos;s record: {RETENTION.endedSessionDays} days after it&apos;s signed out.</li>
        <li>Codes: a day after they expire.</li>
        <li>Sent notification emails: about a week, to keep to a daily limit.</li>
        <li>
          Support messages: until {RETENTION.solvedTicketMonths} months after they&apos;re solved, even if you delete your account, in case you write again about the same thing.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>You can ask for a copy of your data, have it corrected or deleted, ask us to limit or stop using it, object to how we use it, and take it elsewhere.</p>
      <ul>
        <li>
          <b>Account → Your data → Export my data</b> saves everything on your computer as a file.
        </li>
        <li>
          <b>Account → Danger zone → Delete account</b> deletes your account and everything synced to it, including boards you own. The copy on your computer stays.
        </li>
        <li>For anything else, email {contact}. We&apos;ll answer within a month.</li>
      </ul>
      <p>
        If you&apos;re unhappy with how your data is handled, you can complain to the Information Commissioner&apos;s Office (<a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a>),
        or your local data protection authority.
      </p>

      <h2>Age</h2>
      <p>You need to be 13 or older to create an account.</p>

      <h2>Changes</h2>
      <p>If this notice changes, the date at the top changes too. For significant changes, we&apos;ll let account holders know by email.</p>
    </article>
  );
}
