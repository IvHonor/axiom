//! The privacy notice and terms of use, served at `PRIVACY` and `TERMS` and
//! linked from the app's sign-up form. Keep them true to what the server and
//! app actually do: the retention periods come from `crate::housekeeping`.

use axum::extract::State;
use axum::response::Html;

use crate::AppState;
use crate::digest_mail::escape;
use crate::housekeeping::{AI_USAGE_DAYS, ENDED_SESSION_DAYS, SOLVED_TICKET_DAYS, UNCONFIRMED_DAYS};

/// When either page last changed. For a material change, update
/// `axiom_protocol::TERMS_VERSION` too, so new sign-ups agree to the new version.
const UPDATED: &str = "27 October 2026";
/// The youngest anyone can have an account.
const MIN_AGE: u32 = 13;

/// "Axiom is run by …", or nothing if `OPERATOR_NAME` isn't set.
fn operator(s: &AppState) -> String {
    s.operator_name.as_deref().map(|name| format!("Axiom is run by {}. ", escape(name))).unwrap_or_default()
}

fn contact(s: &AppState) -> String {
    match &s.contact_email {
        Some(email) => format!(r#"email <a href="mailto:{0}">{0}</a>"#, escape(email)),
        None => "use the support button (the lifebuoy at the top right of Axiom)".into(),
    }
}

fn layout(title: &str, body: &str) -> Html<String> {
    Html(format!(
        r#"<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} · Axiom</title>
<style>
body{{margin:0;background:#f3efe8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f1d1a;line-height:1.6}}
main{{max-width:680px;margin:32px auto;padding:36px 40px;background:#fff;border:1px solid #ebe6dd;border-radius:16px}}
.brand{{font-size:13px;letter-spacing:4px;font-weight:700}}
h1{{font-size:24px;margin:16px 0 4px}} h2{{font-size:16px;margin:28px 0 6px}}
p,li{{color:#3d3a35;font-size:14.5px}} ul{{padding-left:20px}} .dim{{color:#8a847a;font-size:13px}} a{{color:#b4461e}}
@media (max-width:720px){{main{{margin:0;border-radius:0;border:0;padding:24px 16px}}}}
</style></head><body><main>
<div class="brand">AXIOM</div>
<h1>{title}</h1>
<p class="dim">Last updated {UPDATED}</p>
{body}
</main></body></html>"#
    ))
}

pub async fn page(State(s): State<AppState>) -> Html<String> {
    let (operator, contact) = (operator(&s), contact(&s));
    let months = SOLVED_TICKET_DAYS / 30;
    layout(
        "Privacy notice",
        &format!(
            r#"<p>Axiom keeps your data on your own computer. You don't need an account to use it. This notice covers what happens when you do create one, when you write to support, and the few outside services the app talks to.</p>
<p>{operator}For anything about your data, {contact}.</p>

<h2>Without an account</h2>
<p>Everything stays in a database on your computer. Nothing is sent to the Axiom server, unless you write to support.</p>

<h2>What the Axiom server keeps if you have an account</h2>
<ul>
<li><b>Your account:</b> your email address, and a one-way hash of a key your computer makes from your password. Your password itself never reaches the server. Also the name and picture you choose (if any), and when you signed up and confirmed your email.</li>
<li><b>Your devices:</b> each computer's name (for example "DESKTOP-4F2 (Windows)") and when it was last active, so you can sign devices out.</li>
<li><b>Synced data:</b> a copy of what you sync, so your other computers can catch up.
  <ul>
  <li><b>End-to-end encrypted:</b> Finance, Journal, Notes, Birthdays and Goals are encrypted on your computer before they're sent. The server stores them but can't read them. It only sees which kind of record it is, its ID, and when it changed.</li>
  <li><b>Not end-to-end encrypted:</b> Project Board, Daily Plan, Reading, University, Learning and your settings are stored as they are. They're protected in transit and by access controls, and could be read by whoever runs the server.</li>
  </ul></li>
<li><b>Shared boards:</b> boards you share are visible to the people on them. Invitations keep the invited email address until they're accepted, declined or withdrawn.</li>
<li><b>Notification emails:</b> if you switch on emails, the server keeps each planned email's contents until it's sent. Emails aren't end-to-end encrypted. Finance amounts are never emailed.</li>
<li><b>Codes:</b> codes for confirming your email, resetting your password or turning off the PIN lock are stored only as hashes, and expire after 30 minutes.</li>
<li><b>Support messages:</b> what you write to support, the email address to reply to, and your Axiom version. Each one is kept so we can follow it up, and emailed to our support inbox. You can send one without an account.</li>
<li><b>Axiom on the web list:</b> if you ask to hear when Axiom on the web opens, your email address and when you asked. We'll use it for that one email, then delete the list. Write to us to be taken off it sooner; deleting your account does it too.</li>
</ul>
<p>Your IP address is used briefly, in memory, to limit repeated sign-in attempts. It isn't saved with your account, though our hosting provider may keep standard request logs.</p>
<p>Axiom has no ads and no analytics or tracking, and your data is never sold.</p>

<h2>Why we use it (our lawful bases)</h2>
<ul>
<li><b>To provide the service you asked for</b> (performance of a contract): your account, syncing, shared boards, and the codes for confirming your email or resetting your password.</li>
<li><b>Because you chose it</b> (consent): notification emails, the Axiom on the web list, and what Lemma sends to Google or Groq when you ask it something (explicit consent, for anything sensitive in an area you switch on). Switch emails off at any time, in the app or with the link in each email; switch Lemma's areas off in its settings.</li>
<li><b>Legitimate interests</b>: keeping the service secure (rate limits and backups), answering support messages, and keeping a short record of them.</li>
</ul>

<h2>Who processes it</h2>
<ul>
<li><b>Render</b> hosts the server, in the United States (Ohio).</li>
<li><b>Neon</b> hosts the database, in the United States (Ohio).</li>
<li><b>Resend</b> delivers emails: confirmation and reset codes, board invitations, support messages and replies, and notifications you've switched on.</li>
<li><b>GitHub</b> keeps encrypted nightly backups of the database for 30 days.</li>
<li><b>Google</b> (Gemini) and <b>Groq</b> answer Lemma, the assistant, on Axiom's AI keys. See "Lemma, the assistant".</li>
</ul>
<p>This means your account data is stored in the United States. Each of these providers processes it only on our instructions, under data processing terms. Transfers out of the UK are protected by the safeguards in those terms: the UK's International Data Transfer Addendum, or the UK–US data bridge where the provider is certified.</p>

<h2>Using the web terminal</h2>
<p>The signed-in web terminal saves working copies and pending changes in this browser and syncs supported areas to your account. This browser storage remains on the device after signing out. Use your own browser profile on a trusted device.</p>
<p>Calendars you import or subscribe to on the web, including event details and private iCalendar links, are synced without end-to-end encryption. The website fetches subscription links on your behalf while the terminal is open. Desktop calendar connections remain local to the desktop app and are separate from these web calendars.</p>

<h2>Lemma, the assistant</h2>
<p>Lemma only uses AI when you ask it something. Then it sends:</p>
<ul>
<li>your message, and the conversation so far;</li>
<li>from the areas you've switched on in its settings, only what it looks up to answer, such as the day's tasks or the book you're reading. Areas you haven't switched on are never sent. Journal entries can include sensitive things, like your health: they're only sent if you switch Journal on;</li>
<li>your first name, if your profile has one, and today's date and time;</li>
<li>if you talk to it, the recording, to turn it into text.</li>
</ul>
<p>It goes to <b>Google</b> (Gemini) or <b>Groq</b>, both in the United States.</p>
<ul>
<li><b>On Axiom's AI keys</b> (when you're signed in), it passes through the Axiom server, which sends it on without keeping it. The server only counts your requests each day, for the daily allowance, and notes which service answered and how much it used. Axiom uses Groq, and Google only through its paid service, never its free one. Google doesn't use it to improve its products, and keeps it only for a limited time to detect misuse. Groq doesn't keep it, apart from logs for troubleshooting and misuse that it keeps for up to 30 days.</li>
<li><b>On your own AI key</b>, it goes straight from your computer to Google or Groq, under your own agreement with them. Depending on the service and where you are, free tiers may use what they're sent to improve their models.</li>
</ul>
<p>Your chats with Lemma stay on your computer and, with an account, sync end-to-end encrypted. Nothing Lemma suggests changes your data until you confirm it. You can switch an area off, or stop using Lemma, at any time.</p>

<h2>Services the app contacts directly</h2>
<p>These go straight from your computer, never through the Axiom server, and only when you use the feature:</p>
<ul>
<li><b>Open Library</b> (openlibrary.org), to search for books and show covers in Reading and Learning, and when Lemma looks a book up for you. Only the search (a title, author or ISBN) is sent.</li>
<li><b>YouTube</b> (Google), to read a playlist's videos when you import one into Learning. Only the playlist link is sent.</li>
<li><b>Frankfurter</b> (frankfurter.dev), for currency exchange rates in Finance. Only currency codes and dates are sent.</li>
<li><b>Google, Microsoft, iCloud or Fastmail</b>, if you connect a calendar to Daily Plan. Your calendar events stay on your computer: they aren't synced or sent to the Axiom server. Sign-in tokens are kept in your computer's credential store. Axiom's use of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements.</li>
<li><b>GitHub</b>, to check for and download Axiom updates.</li>
</ul>

<h2>How long it's kept</h2>
<ul>
<li>What you send Lemma: the Axiom server doesn't keep it. Groq may keep troubleshooting logs for up to 30 days, and Google keeps it for a limited time to detect misuse.</li>
<li>How many times you used Lemma each day, for the daily allowance: {AI_USAGE_DAYS} days.</li>
<li>Your account and everything synced to it: until you delete your account. Copies in backups are gone within 30 days after that.</li>
<li>Sign-ups that never confirmed their email: {UNCONFIRMED_DAYS} days.</li>
<li>A device's record: {ENDED_SESSION_DAYS} days after it's signed out.</li>
<li>Codes: a day after they expire.</li>
<li>Sent notification emails: about a week, to keep to a daily limit.</li>
<li>Support messages: until {months} months after they're solved, even if you delete your account, in case you write again about the same thing.</li>
</ul>

<h2>Your rights</h2>
<p>You can ask for a copy of your data, have it corrected or deleted, ask us to limit or stop using it, object to how we use it, and take it elsewhere.</p>
<ul>
<li><b>Account → Your data → Export my data</b> saves everything on your computer as a file.</li>
<li><b>Account → Danger zone → Delete account</b> deletes your account and everything synced to it, including boards you own. The copy on your computer stays.</li>
<li>For anything else, {contact}. We'll answer within a month.</li>
</ul>
<p>If you're unhappy with how your data is handled, you can complain to the Information Commissioner's Office (<a href="https://ico.org.uk/make-a-complaint/">ico.org.uk</a>), or your local data protection authority.</p>

<h2>Age</h2>
<p>You need to be {MIN_AGE} or older to create an account.</p>

<h2>Changes</h2>
<p>If this notice changes, the date at the top changes too. For significant changes, we'll let account holders know by email.</p>"#
        ),
    )
}

pub async fn terms(State(s): State<AppState>) -> Html<String> {
    let (operator, contact) = (operator(&s), contact(&s));
    layout(
        "Terms of use",
        &format!(
            r#"<p>{operator}These terms cover Axiom accounts and the online service: syncing, shared boards, emails and support. The Axiom app itself is open source, under the MIT licence. These terms don't limit what that licence allows you to do with the code.</p>

<h2>An early version</h2>
<p>Axiom is new, free, and still changing. Features may change or be removed, and things may sometimes break. Your data always stays on your computer, and <b>Account → Your data → Export my data</b> saves a copy whenever you like. We recommend doing that now and then.</p>

<h2>Your account</h2>
<ul>
<li>You need to be {MIN_AGE} or older. If you're under 18, check with a parent or guardian first.</li>
<li>Use an email address that's yours, and keep your password safe. You're responsible for what's done with your account.</li>
<li>You can delete your account at any time, in <b>Account → Danger zone</b>.</li>
</ul>

<h2>Your content</h2>
<p>What you put in Axiom stays yours. You let us store it and send it between your devices, and to the people you share boards with, only to run the service. The <a href="/privacy">privacy notice</a> explains how it's handled.</p>

<h2>Fair use</h2>
<p>Don't use Axiom to break the law, to harass or spam anyone (including through board invitations or support messages), or to share anything you don't have the right to share. Don't try to get into other people's accounts or data, overload the service, or get round its limits. We may suspend or close accounts that do, and we'll tell you why where we can.</p>

<h2>If the service ends</h2>
<p>If we ever stop running the online service, we'll email account holders in advance where we can, so you have time to export your data. The app keeps working on your computer without an account.</p>

<h2>Liability</h2>
<p>The service is free and provided as it is, without promises that it will always be available or free of faults. As far as the law allows, we're not responsible for loss of data or for indirect losses. Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else the law doesn't allow to be limited, and nothing affects your legal rights as a consumer.</p>

<h2>Changes and contact</h2>
<p>If these terms change, the date at the top changes too. For significant changes, we'll let account holders know by email. Questions? {contact}.</p>
<p>These terms are governed by the law of England and Wales. If you live elsewhere in the UK, you can also bring a claim in your own country's courts.</p>"#
        ),
    )
}
