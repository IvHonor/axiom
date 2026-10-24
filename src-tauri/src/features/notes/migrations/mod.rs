//! The Notes migrations, oldest first. Never edit or rename one that has
//! shipped; add a new one instead.

use sea_orm_migration::MigrationTrait;

mod m001_notes_schema;

pub fn all() -> Vec<Box<dyn MigrationTrait>> {
    vec![Box::new(m001_notes_schema::Migration)]
}
