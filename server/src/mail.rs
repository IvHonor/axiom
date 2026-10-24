//! Sending email. Production uses Resend (resend.com); without an API key the
//! server prints emails to its log instead, so development needs no setup.

use std::sync::{Arc, Mutex};

use serde_json::json;

#[derive(Debug, Clone)]
pub struct Email {
    pub to: String,
    pub subject: String,
    pub text: String,
    pub html: String,
    /// A one-click unsubscribe link, sent as the List-Unsubscribe headers mail
    /// apps turn into an "Unsubscribe" button.
    pub unsubscribe: Option<String>,
    /// Where a reply goes instead of the sender, e.g. the person who wrote to support.
    pub reply_to: Option<String>,
}

pub enum Mailer {
    Resend { http: reqwest::Client, api_key: String, from: String },
    /// No provider configured: log each email (development).
    Log,
    /// Keeps emails in memory, for tests to read.
    Memory(Arc<Mutex<Vec<Email>>>),
}

impl Mailer {
    pub fn resend(api_key: String, from: String) -> Self {
        Mailer::Resend { http: reqwest::Client::new(), api_key, from }
    }

    pub async fn send(&self, email: Email) -> Result<(), String> {
        match self {
            Mailer::Resend { http, api_key, from } => {
                let headers = match &email.unsubscribe {
                    Some(link) => json!({ "List-Unsubscribe": format!("<{link}>"), "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }),
                    None => json!({}),
                };
                let mut body = json!({
                    "from": from,
                    "to": [email.to],
                    "subject": email.subject,
                    "text": email.text,
                    "html": email.html,
                    "headers": headers,
                });
                if let Some(reply_to) = email.reply_to {
                    body["reply_to"] = json!(reply_to);
                }
                let response = http
                    .post("https://api.resend.com/emails")
                    .bearer_auth(api_key)
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| format!("Couldn't reach Resend: {e}"))?;
                if response.status().is_success() {
                    Ok(())
                } else {
                    let status = response.status();
                    Err(format!("Resend refused the email ({status}): {}", response.text().await.unwrap_or_default()))
                }
            }
            Mailer::Log => {
                tracing::info!("Email to {} ({}):\n{}", email.to, email.subject, email.text);
                Ok(())
            }
            Mailer::Memory(sent) => {
                sent.lock().unwrap().push(email);
                Ok(())
            }
        }
    }
}

/// The password reset email. `code` is shown as `XXXX-XXXX`.
pub fn reset_code(to: &str, code: &str, minutes: i64) -> Email {
    let shown = format!("{}-{}", &code[..4], &code[4..]);
    Email {
        to: to.into(),
        unsubscribe: None,
        reply_to: None,
        subject: format!("Your Axiom password reset code: {shown}"),
        text: format!(
            "Your code is {shown}\n\nEnter it in Axiom to choose a new password. It works for {minutes} minutes.\n\n\
             If you didn't ask to reset your password, ignore this email; your password hasn't changed."
        ),
        html: format!(
            "<p>Your code is</p>\
             <p style=\"font-size:28px;font-weight:600;letter-spacing:4px;font-family:monospace\">{shown}</p>\
             <p>Enter it in Axiom to choose a new password. It works for {minutes} minutes.</p>\
             <p style=\"color:#777\">If you didn't ask to reset your password, ignore this email; your password hasn't changed.</p>"
        ),
    }
}

/// The code that confirms a new account's address. `code` is shown as `XXXX-XXXX`.
pub fn confirm_code(to: &str, code: &str, minutes: i64) -> Email {
    code_email(
        to,
        code,
        "Confirm your email for Axiom",
        &format!("Enter it in Axiom to finish creating your account. It works for {minutes} minutes."),
        "If you didn't create an Axiom account, ignore this email; nothing happens without the code.",
    )
}

/// The code that turns off the app lock on a device, for a forgotten PIN.
pub fn unlock_code(to: &str, code: &str, minutes: i64) -> Email {
    code_email(
        to,
        code,
        "Your Axiom unlock code",
        &format!("Enter it in Axiom to turn off the PIN lock, then choose a new PIN. It works for {minutes} minutes."),
        "If you didn't ask for this, someone may be trying to open Axiom on one of your computers. They can't without this code.",
    )
}

fn code_email(to: &str, code: &str, title: &str, use_it: &str, otherwise: &str) -> Email {
    let shown = format!("{}-{}", &code[..4], &code[4..]);
    Email {
        to: to.into(),
        unsubscribe: None,
        reply_to: None,
        subject: format!("{title}: {shown}"),
        text: format!("Your code is {shown}\n\n{use_it}\n\n{otherwise}"),
        html: format!(
            "<p>Your code is</p>\
             <p style=\"font-size:28px;font-weight:600;letter-spacing:4px;font-family:monospace\">{shown}</p>\
             <p>{use_it}</p>\
             <p style=\"color:#777\">{otherwise}</p>"
        ),
    }
}

/// A support ticket, to the support inbox. Replying answers the sender.
pub fn support_ticket(to: &str, reference: &str, kind: &str, ticket: &crate::entities::support_ticket::Model, signed_in: bool) -> Email {
    let who = if signed_in { "signed in to their account" } else { "not signed in, so the address isn't confirmed" };
    let text = format!(
        "{kind} from {email} ({who}), Axiom {version}\n\n{subject}\n\n{message}\n\n\
         Reply to this email to answer them. Mark it solved in Axiom's admin panel under Support.",
        email = ticket.email,
        version = ticket.app_version,
        subject = ticket.subject,
        message = ticket.message,
    );
    let html = format!(
        "<p style=\"color:#777\">{kind} from <b>{email}</b> ({who}), Axiom {version}</p>\
         <p style=\"font-size:16px;font-weight:600\">{subject}</p>\
         <p style=\"white-space:pre-wrap\">{message}</p>\
         <p style=\"color:#777\">Reply to this email to answer them. Mark it solved in Axiom's admin panel under Support.</p>",
        kind = escape(kind),
        email = escape(&ticket.email),
        version = escape(&ticket.app_version),
        subject = escape(&ticket.subject),
        message = escape(&ticket.message),
    );
    Email {
        to: to.into(),
        subject: format!("[Axiom support {reference}] {}", ticket.subject),
        text,
        html,
        unsubscribe: None,
        reply_to: Some(ticket.email.clone()),
    }
}

/// The receipt for someone who wrote to support. With a support inbox, replies go there.
pub fn support_received(to: &str, reference: &str, subject: &str, inbox: Option<&str>) -> Email {
    let more = if inbox.is_some() { " To add anything, reply to this email." } else { "" };
    Email {
        to: to.into(),
        subject: format!("We've got your message: {subject} [{reference}]"),
        text: format!("Thanks for writing to Axiom support. Your reference is {reference}.\n\nWe'll reply to this address as soon as we can.{more}"),
        html: format!(
            "<p>Thanks for writing to Axiom support. Your reference is <b>{reference}</b>.</p>\
             <p>We'll reply to this address as soon as we can.{more}</p>"
        ),
        unsubscribe: None,
        reply_to: inbox.map(str::to_owned),
    }
}

/// An invitation to a shared board.
pub fn board_invite(to: &str, inviter: &str, board: &str, role: axiom_protocol::Role, days: i64) -> Email {
    let can = match role {
        axiom_protocol::Role::Viewer => "see",
        axiom_protocol::Role::Editor => "work on the cards in",
        _ => "manage",
    };
    let escape = |t: &str| t.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;");
    Email {
        to: to.into(),
        unsubscribe: None,
        reply_to: None,
        subject: format!("{inviter} invited you to the board \"{board}\" on Axiom"),
        text: format!(
            "{inviter} invited you to {can} their board \"{board}\" on Axiom.

             To accept, open Axiom and sign in with this email address (or create an account with it),              then open the Project Board's side panel and accept the invitation. It expires in {days} days.

             If you weren't expecting this, you can ignore it."
        ),
        html: format!(
            "<p><b>{inviter_html}</b> invited you to {can} their board <b>{board_html}</b> on Axiom.</p>             <p>To accept, open Axiom and sign in with this email address (or create an account with it),              then open the Project Board's side panel and accept the invitation. It expires in {days} days.</p>             <p style=\"color:#777\">If you weren't expecting this, you can ignore it.</p>",
            inviter_html = escape(inviter),
            board_html = escape(board),
        ),
    }
}

/// Tells an admin someone has asked for an account.
pub fn waitlist_request(to: &str, email: &str) -> Email {
    Email {
        to: to.into(),
        unsubscribe: None,
        reply_to: None,
        subject: format!("{email} wants an Axiom account"),
        text: format!(
            "{email} has signed up and is on the waiting list.\n\n\
             To let them in, open Axiom, go to Account, and approve them under Waiting list."
        ),
        html: format!(
            "<p><b>{}</b> has signed up and is on the waiting list.</p>\
             <p>To let them in, open Axiom, go to Account, and approve them under Waiting list.</p>",
            escape(email)
        ),
    }
}

/// Tells someone on the waiting list they can sign in now.
pub fn account_approved(to: &str) -> Email {
    Email {
        to: to.into(),
        unsubscribe: None,
        reply_to: None,
        subject: "Your Axiom account is ready".into(),
        text: "Good news: your Axiom account has been approved.\n\n\
               Open Axiom, go to Account, and sign in with this email address and the password you chose to start syncing."
            .into(),
        html: "<p>Good news: your Axiom account has been approved.</p>\
               <p>Open Axiom, go to Account, and sign in with this email address and the password you chose to start syncing.</p>"
            .into(),
    }
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}
