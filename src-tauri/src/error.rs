//! The error type every command returns. React receives it as a plain message
//! string, which `invoke` rejects with.

use std::fmt;

use sea_orm::DbErr;
use serde::{Serialize, Serializer};

#[derive(Debug)]
pub enum Error {
    /// The database isn't configured or couldn't be reached.
    Unavailable(String),
    /// A query failed.
    Db(DbErr),
    /// The thing asked for doesn't exist.
    NotFound(&'static str),
    /// The request doesn't make sense, e.g. deleting a column that still has tasks.
    Invalid(String),
    /// Signing up, in or out failed; the message comes ready to show.
    Account(String),
}

pub type Result<T> = std::result::Result<T, Error>;

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Error::Unavailable(message) | Error::Invalid(message) | Error::Account(message) => f.write_str(message),
            Error::Db(_) => f.write_str("Axiom couldn't save or load that. Try again, and restart Axiom if it keeps happening."),
            Error::NotFound(what) => write!(f, "That {} no longer exists. It may have been deleted on another device.", what.to_lowercase()),
        }
    }
}

impl std::error::Error for Error {}

/// Lets `?` turn a SeaORM error into ours.
impl From<DbErr> for Error {
    fn from(err: DbErr) -> Self {
        Error::Db(err)
    }
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        // The user sees a plain sentence; the technical cause goes to the log.
        if let Error::Db(err) = self {
            eprintln!("database error: {err}");
        }
        serializer.serialize_str(&self.to_string())
    }
}
