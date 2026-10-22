//! What your role on a shared board lets you change here. The server is what
//! enforces it (see `axiom_protocol::space_table_role`); checking first means
//! a viewer gets a clear message instead of an edit that bounces back.
//! Projects that aren't shared are yours, so everything is allowed.

use axiom_protocol::Role;
use sea_orm::{ConnectionTrait, EntityTrait};

use super::entities::{checklist_item, column, label, task, template};
use crate::error::{Error, Result};
use crate::sync::spaces::role_of;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Need {
    /// Working on cards: editors and up.
    Cards,
    /// Changing the board itself (columns, labels, templates, its name): admins and up.
    Board,
}

/// Whether your role on the project allows it.
pub async fn allowed(db: &impl ConnectionTrait, project_id: &str, need: Need) -> Result<bool> {
    let Some(role) = role_of(db, project_id).await? else { return Ok(true) };
    Ok(role >= if need == Need::Cards { Role::Editor } else { Role::Admin })
}

pub async fn project(db: &impl ConnectionTrait, project_id: &str, need: Need) -> Result<()> {
    if allowed(db, project_id, need).await? {
        return Ok(());
    }
    let viewer = role_of(db, project_id).await? == Some(Role::Viewer);
    Err(Error::Invalid(if viewer {
        "You can view this board but not change it. Ask one of its admins for edit access.".into()
    } else {
        "Only the board's admins can change its columns, labels, templates and name.".into()
    }))
}

pub async fn column(db: &impl ConnectionTrait, id: &str, need: Need) -> Result<()> {
    let found = column::Entity::find_by_id(id).one(db).await?.ok_or(Error::NotFound("Column"))?;
    project(db, &found.project_id, need).await
}

pub async fn task(db: &impl ConnectionTrait, id: &str, need: Need) -> Result<()> {
    let found = task::Entity::find_by_id(id).one(db).await?.ok_or(Error::NotFound("Task"))?;
    project(db, &found.project_id, need).await
}

pub async fn label(db: &impl ConnectionTrait, id: &str, need: Need) -> Result<()> {
    let found = label::Entity::find_by_id(id).one(db).await?.ok_or(Error::NotFound("Label"))?;
    project(db, &found.project_id, need).await
}

pub async fn checklist_item(db: &impl ConnectionTrait, id: &str, need: Need) -> Result<()> {
    let found = checklist_item::Entity::find_by_id(id).one(db).await?.ok_or(Error::NotFound("Checklist item"))?;
    task(db, &found.task_id, need).await
}

pub async fn template(db: &impl ConnectionTrait, id: &str, need: Need) -> Result<()> {
    let found = template::Entity::find_by_id(id).one(db).await?.ok_or(Error::NotFound("Template"))?;
    project(db, &found.project_id, need).await
}

/// A shared board isn't deleted from here: members leave it, and its owner
/// stops sharing it first.
pub async fn not_shared(db: &impl ConnectionTrait, project_id: &str) -> Result<()> {
    match role_of(db, project_id).await? {
        None => Ok(()),
        Some(Role::Owner) => Err(Error::Invalid("Stop sharing this board before deleting it.".into())),
        Some(_) => Err(Error::Invalid("This board is shared with you. Leave it instead.".into())),
    }
}
