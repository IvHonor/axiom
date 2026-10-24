import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED, OPERATOR_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms for Axiom accounts and the online service.",
};

// Keep in step with the server's copy, server/src/privacy.rs.
export default function TermsPage() {
  return (
    <article className="page wrap">
      <h1>Terms of use</h1>
      <p className="muted">Last updated {LEGAL_UPDATED}</p>
      <p>
        {OPERATOR_NAME && <>Axiom is run by {OPERATOR_NAME}. </>}These terms cover Axiom accounts and the online service: syncing, shared boards, emails and support. The Axiom app itself
        is open source, under the MIT licence. These terms don&apos;t limit what that licence allows you to do with the code.
      </p>

      <h2>An early version</h2>
      <p>
        Axiom is new, free, and still changing. Features may change or be removed, and things may sometimes break. Your data always stays on your computer, and{" "}
        <b>Account → Your data → Export my data</b> saves a copy whenever you like. We recommend doing that now and then.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You need to be 13 or older. If you&apos;re under 18, check with a parent or guardian first.</li>
        <li>Use an email address that&apos;s yours, and keep your password safe. You&apos;re responsible for what&apos;s done with your account.</li>
        <li>
          You can delete your account at any time, in <b>Account → Danger zone</b>.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        What you put in Axiom stays yours. You let us store it and send it between your devices, and to the people you share boards with, only to run the service. The{" "}
        <Link href="/privacy">privacy notice</Link> explains how it&apos;s handled.
      </p>

      <h2>Fair use</h2>
      <p>
        Don&apos;t use Axiom to break the law, to harass or spam anyone (including through board invitations or support messages), or to share anything you don&apos;t have the right to
        share. Don&apos;t try to get into other people&apos;s accounts or data, overload the service, or get round its limits. We may suspend or close accounts that do, and we&apos;ll tell
        you why where we can.
      </p>

      <h2>If the service ends</h2>
      <p>If we ever stop running the online service, we&apos;ll email account holders in advance where we can, so you have time to export your data. The app keeps working on your computer without an account.</p>

      <h2>Liability</h2>
      <p>
        The service is free and provided as it is, without promises that it will always be available or free of faults. As far as the law allows, we&apos;re not responsible for loss of
        data or for indirect losses. Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else the law doesn&apos;t allow to
        be limited, and nothing affects your legal rights as a consumer.
      </p>

      <h2>Changes and contact</h2>
      <p>
        If these terms change, the date at the top changes too. For significant changes, we&apos;ll let account holders know by email. Questions? Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <p>These terms are governed by the law of England and Wales. If you live elsewhere in the UK, you can also bring a claim in your own country&apos;s courts.</p>
    </article>
  );
}
