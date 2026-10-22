//! The Reading Tracker's migrations, oldest first. Never edit or rename one
//! that has shipped; add a new one instead.

use sea_orm_migration::MigrationTrait;

mod m001_reading_schema;

pub fn all() -> Vec<Box<dyn MigrationTrait>> {
    vec![Box::new(m001_reading_schema::Migration)]
}
