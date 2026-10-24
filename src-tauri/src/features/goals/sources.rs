//! Goals that follow other extensions: where each number comes from, read
//! fresh every time, so progress made there shows here by itself.

use sea_orm::DatabaseConnection;
use sea_orm::prelude::Date;

use super::entities::goal;
use super::types::{SourceOption, Sources};
use crate::error::Result;
use crate::features::{finance, journal, project_board, reading, uni};

/// What a target can follow.
pub const FOR_TARGETS: &[&str] = &["manual", "finance_account", "reading_books", "reading_pages", "journal_entries"];
/// What milestones can follow, instead of being listed by hand.
pub const FOR_MILESTONES: &[&str] = &["manual", "project", "uni_module"];
/// Sources that follow one thing (an account, a project, a module).
pub const NEED_ID: &[&str] = &["finance_account", "project", "uni_module"];

/// A source's reading: where it is, out of what (for projects and modules,
/// whose size changes), and what it's called.
pub struct Reading {
    pub current: f64,
    pub out_of: Option<f64>,
    pub name: String,
}

/// None when the goal is manual, or what it followed has gone.
pub async fn read(db: &DatabaseConnection, g: &goal::Model, today: Date) -> Result<Option<Reading>> {
    Ok(match g.source.as_str() {
        "finance_account" => finance::service::cards(db, today).await?.into_iter().find(|c| c.account.id == g.source_id).map(|c| Reading {
            current: c.balance as f64 / 10f64.powi(finance::money::exponent(&c.account.currency) as i32),
            out_of: None,
            name: c.account.name,
        }),
        "reading_books" | "reading_pages" => {
            let (books, pages) = reading::service::totals_since(db, g.start_date).await?;
            let (count, name) = if g.source == "reading_books" { (books, "Books finished") } else { (pages, "Pages read") };
            Some(Reading { current: g.start_value + f64::from(count), out_of: None, name: name.into() })
        }
        "journal_entries" => {
            let days = journal::service::list(db, Default::default()).await?.iter().filter(|e| e.day >= g.start_date && e.day <= today && (e.words > 0 || e.mood.is_some())).count();
            Some(Reading { current: g.start_value + days as f64, out_of: None, name: "Journal entries".into() })
        }
        "project" => match project_board::service::progress(db, &g.source_id).await {
            Ok((done, all)) => {
                let name = project_board::service::list_projects(db).await?.into_iter().find(|p| p.id == g.source_id).map(|p| p.name).unwrap_or_default();
                Some(Reading { current: f64::from(done), out_of: Some(f64::from(all)), name })
            }
            Err(_) => None,
        },
        "uni_module" => match uni::service::get_module(db, &g.source_id, today).await {
            Ok(m) => Some(Reading { current: f64::from(m.card.caught_up), out_of: Some(f64::from(m.card.lectures)), name: format!("{} {}", m.card.module.code, m.card.module.name).trim().to_owned() }),
            Err(_) => None,
        },
        _ => None,
    })
}

/// What there is to follow: accounts, projects, and this term's modules.
pub async fn options(db: &DatabaseConnection, today: Date) -> Result<Sources> {
    let accounts = finance::service::cards(db, today)
        .await?
        .into_iter()
        .filter(|c| !c.account.archived)
        .map(|c| SourceOption { id: c.account.id, name: c.account.name, unit: c.account.currency })
        .collect();
    let projects = project_board::service::list_projects(db).await?.into_iter().map(|p| SourceOption { id: p.id, name: p.name, unit: String::new() }).collect();
    let modules = uni::service::summary(db, today)
        .await?
        .modules
        .into_iter()
        .map(|m| SourceOption { name: format!("{} {}", m.module.code, m.module.name).trim().to_owned(), id: m.module.id, unit: String::new() })
        .collect();
    Ok(Sources { accounts, projects, modules })
}
