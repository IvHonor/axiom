// Who runs Axiom and how to reach them, from the deployment's environment
// (set in Vercel: OPERATOR_NAME, CONTACT_EMAIL). Same values as the server's.

export const SITE_URL = process.env.SITE_URL ?? "https://axiomterminal.app";

export const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? "support@axiomterminal.app";

/** A person's or business's name; null leaves it unsaid. */
export const OPERATOR_NAME = process.env.OPERATOR_NAME?.trim() || null;

/** When the privacy notice and terms last changed. Keep in step with
 * `UPDATED` in server/src/privacy.rs. */
export const LEGAL_UPDATED = "24 October 2026";

/** How long the server keeps things: keep in step with server/src/housekeeping.rs. */
export const RETENTION = { unconfirmedDays: 7, endedSessionDays: 30, solvedTicketMonths: 12 };
