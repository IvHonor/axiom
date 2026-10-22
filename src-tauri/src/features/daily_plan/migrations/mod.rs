//! The Daily Plan's migrations, oldest first. Never edit or rename one that
//! has shipped; add a new one instead.

use sea_orm_migration::MigrationTrait;

mod m001_daily_plan_schema;
mod m002_rituals_and_time;
mod m003_routines;
mod m004_calendars;
mod m005_calendar_accounts;
mod m006_event_details;

pub fn all() -> Vec<Box<dyn MigrationTrait>> {
    vec![
        Box::new(m001_daily_plan_schema::Migration),
        Box::new(m002_rituals_and_time::Migration),
        Box::new(m003_routines::Migration),
        Box::new(m004_calendars::Migration),
        Box::new(m005_calendar_accounts::Migration),
        Box::new(m006_event_details::Migration),
    ]
}
