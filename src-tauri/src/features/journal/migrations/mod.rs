//! The Journal's migrations, oldest first. Never edit or rename one that has
//! shipped; add a new one instead.

use sea_orm_migration::MigrationTrait;

mod m001_journal_schema;

pub fn all() -> Vec<Box<dyn MigrationTrait>> {
    vec![Box::new(m001_journal_schema::Migration)]
}
