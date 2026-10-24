//! Notifications: reminders and summaries from the extensions, shown in the
//! app, on the desktop, and (planned here, sent by the server) by email.
//!
//! - `kinds.rs` lists every notification: what it's for, when it comes and
//!   whether it can be emailed
//! - `digests.rs` works out what one says from the extension's data
//! - `settings.rs` keeps the user's choices per notification and channel
//!   (synced, so every computer agrees)
//! - `runner.rs` checks every minute: shows what's come due in the app and on
//!   the desktop, and keeps the server's email plan up to date
//! - `commands.rs` exposes it all to React

pub mod commands;
pub(crate) mod digests;
mod entities;
pub(crate) mod kinds;
pub mod migrations;
pub mod runner;
pub(crate) mod settings;

#[cfg(test)]
mod tests;

/// Synced so a choice made on one computer applies on all of them. Named
/// `_settings` so it isn't counted as data when linking an account.
pub const SYNCED_TABLES: &[&str] = &["notification_settings"];

/// Sent to React when the list of notifications changes.
pub const CHANGED_EVENT: &str = "notifications-changed";
