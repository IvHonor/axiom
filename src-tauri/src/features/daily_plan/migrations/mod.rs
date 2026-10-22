//! The Daily Plan's migrations, oldest first. Never edit or rename one that
//! has shipped; add a new one instead.

use sea_orm_migration::MigrationTrait;

mod m001_daily_plan_schema;
mod m002_rituals_and_time;

pub fn all() -> Vec<Box<dyn MigrationTrait>> {
    vec![Box::new(m001_daily_plan_schema::Migration), Box::new(m002_rituals_and_time::Migration)]
}
