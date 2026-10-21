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
                let response = http
                    .post("https://api.resend.com/emails")
                    .bearer_auth(api_key)
                    .json(&json!({
                        "from": from,
                        "to": [email.to],
                        "subject": email.subject,
                        "text": email.text,
                        "html": email.html,
                    }))
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
