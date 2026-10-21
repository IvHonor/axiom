//! The Project Board's migrations, oldest first. Each has a unique name that
//! starts with the feature, so names never collide with other features'.
//! Never edit or rename one that has shipped; add a new one instead.

use sea_orm_migration::MigrationTrait;

mod m001_local_schema;

pub fn all() -> Vec<Box<dyn MigrationTrait>> {
    vec![Box::new(m001_local_schema::Migration)]
}
