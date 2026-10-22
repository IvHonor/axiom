//! Sharing Project Board projects with other accounts: the commands React
//! calls, wrapped by `src/features/project_board/sharing.ts`. The server
//! checks every permission; these explain them and keep this computer's
//! copy of each board in step.

use axiom_protocol::{Adopt, Invite, Member, MyInvite, NewInvite, Role, SYNC_BATCH};
use chrono::{DateTime, Utc};
use sea_orm::DatabaseConnection;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use super::spaces::{self, LocalSpace};
use super::{DATA_CHANGED_EVENT, SyncEngine, local};
use crate::account::Account;
use crate::db::Db;
use crate::error::{Error, Result};

/// The signed-in account's id, with this computer's data linked to it.
async fn linked_user(db: &DatabaseConnection, account: &Account) -> Result<String> {
    let user_id = account.user_id().await.ok_or_else(|| Error::Account("Sign in to share boards with other people.".into()))?;
    let state = local::state(db).await?;
    if state.user_id.as_deref() != Some(user_id.as_str()) {
        return Err(Error::Account("Finish setting up sync in the Account panel first.".into()));
    }
    Ok(user_id)
}

async fn local_board(db: &DatabaseConnection, id: &str) -> Result<LocalSpace> {
    spaces::list(db).await?.into_iter().find(|b| b.id == id).ok_or(Error::NotFound("Shared board"))
}

/// Shares one of your projects. You become its owner; its rows move from
/// your account to the shared board.
pub async fn share(db: &DatabaseConnection, account: &Account, project_id: &str) -> Result<LocalSpace> {
    linked_user(db, account).await?;
    if spaces::role_of(db, project_id).await?.is_some() {
        return Err(Error::Invalid("This board is already shared.".into()));
    }
    if !spaces::project_exists(db, project_id).await? {
        return Err(Error::NotFound("Project"));
    }
    let rows = spaces::rows_of_project(db, project_id).await?;
    let space = account.create_space(project_id).await?;
    spaces::upsert(db, &space).await?;
    for chunk in rows.chunks(SYNC_BATCH) {
        account.adopt(project_id, &Adopt { records: chunk.to_vec() }).await?;
    }
    // Rows the server didn't have yet go straight to the board.
    spaces::queue(db, &rows).await?;
    local_board(db, project_id).await
}

/// Stops sharing (owner): members lose the board; you keep it as your own.
pub async fn stop_sharing(db: &DatabaseConnection, account: &Account, project_id: &str) -> Result<()> {
    linked_user(db, account).await?;
    if local_board(db, project_id).await?.role != Role::Owner {
        return Err(Error::Invalid("Only the board's owner can stop sharing it.".into()));
    }
    account.delete_space(project_id).await?;
    spaces::make_personal(db, project_id).await?;
    Ok(())
}

/// Leaves a board someone else shared with you; it's removed from this computer.
pub async fn leave(db: &DatabaseConnection, account: &Account, project_id: &str) -> Result<()> {
    let user_id = linked_user(db, account).await?;
    account.remove_member(project_id, &user_id).await?;
    spaces::remove_board(db, project_id).await?;
    Ok(())
}

/// Joins a board. Its cards arrive with the next sync.
pub async fn accept_invite(db: &DatabaseConnection, account: &Account, invite_id: &str) -> Result<LocalSpace> {
    linked_user(db, account).await?;
    let space = account.accept_invite(invite_id).await?;
    spaces::upsert(db, &space).await?;
    local_board(db, &space.id).await
}

/// The boards this computer has shared, with your role in each. No network.
#[tauri::command]
pub async fn board_shared_boards(db: State<'_, Db>) -> Result<Vec<LocalSpace>> {
    Ok(spaces::list(&db.conn().await?).await?)
}

/// Shares one of your projects. You become its owner; its rows move from
/// your account to the shared board.
#[tauri::command]
pub async fn board_share(engine: State<'_, SyncEngine>, db: State<'_, Db>, account: State<'_, Account>, project_id: String) -> Result<LocalSpace> {
    let board = share(&db.conn().await?, &account, &project_id).await?;
    engine.wake();
    Ok(board)
}

#[tauri::command]
pub async fn board_stop_sharing(engine: State<'_, SyncEngine>, db: State<'_, Db>, account: State<'_, Account>, project_id: String) -> Result<()> {
    stop_sharing(&db.conn().await?, &account, &project_id).await?;
    engine.wake();
    Ok(())
}

#[tauri::command]
pub async fn board_leave(
    app: AppHandle,
    engine: State<'_, SyncEngine>,
    db: State<'_, Db>,
    account: State<'_, Account>,
    project_id: String,
) -> Result<()> {
    leave(&db.conn().await?, &account, &project_id).await?;
    let _ = app.emit(DATA_CHANGED_EVENT, ());
    engine.wake();
    Ok(())
}

/// A member, for React. Mirrors `Member` in `sharing.ts`.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MemberView {
    pub user_id: String,
    pub email: String,
    pub role: Role,
    pub joined_at: DateTime<Utc>,
    pub you: bool,
}

impl From<Member> for MemberView {
    fn from(m: Member) -> Self {
        Self { user_id: m.user_id, email: m.email, role: m.role, joined_at: m.joined_at, you: m.you }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InviteView {
    pub id: String,
    pub email: String,
    pub role: Role,
    pub invited_by: String,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

impl From<Invite> for InviteView {
    fn from(i: Invite) -> Self {
        Self { id: i.id, email: i.email, role: i.role, invited_by: i.invited_by, created_at: i.created_at, expires_at: i.expires_at }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MembersView {
    pub members: Vec<MemberView>,
    /// Empty unless you're an admin.
    pub invites: Vec<InviteView>,
}

/// Who's on a board (and, for admins, who's been invited).
#[tauri::command]
pub async fn board_members(db: State<'_, Db>, account: State<'_, Account>, project_id: String) -> Result<MembersView> {
    let db = db.conn().await?;
    linked_user(&db, &account).await?;
    let found = account.members(&project_id).await?;
    // Keep the member count and your role here up to date while we're at it.
    if let Some(me) = found.members.iter().find(|m| m.you) {
        if let Ok(mut board) = local_board(&db, &project_id).await {
            board.role = me.role;
            board.members = found.members.len() as i64;
            let space = axiom_protocol::Space {
                id: board.id,
                name: board.name,
                role: board.role,
                owner_email: board.owner_email,
                members: board.members as u32,
            };
            spaces::upsert(&db, &space).await?;
        }
    }
    Ok(MembersView {
        members: found.members.into_iter().map(MemberView::from).collect(),
        invites: found.invites.into_iter().map(InviteView::from).collect(),
    })
}

#[tauri::command]
pub async fn board_invite(db: State<'_, Db>, account: State<'_, Account>, project_id: String, email: String, role: Role) -> Result<InviteView> {
    linked_user(&db.conn().await?, &account).await?;
    Ok(account.invite(&project_id, &NewInvite { email, role }).await?.into())
}

#[tauri::command]
pub async fn board_withdraw_invite(db: State<'_, Db>, account: State<'_, Account>, project_id: String, invite_id: String) -> Result<()> {
    linked_user(&db.conn().await?, &account).await?;
    Ok(account.withdraw_invite(&project_id, &invite_id).await?)
}

#[tauri::command]
pub async fn board_set_role(db: State<'_, Db>, account: State<'_, Account>, project_id: String, user_id: String, role: Role) -> Result<()> {
    linked_user(&db.conn().await?, &account).await?;
    Ok(account.change_role(&project_id, &user_id, role).await?)
}

#[tauri::command]
pub async fn board_remove_member(db: State<'_, Db>, account: State<'_, Account>, project_id: String, user_id: String) -> Result<()> {
    linked_user(&db.conn().await?, &account).await?;
    Ok(account.remove_member(&project_id, &user_id).await?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MyInviteView {
    pub id: String,
    pub board_id: String,
    pub board_name: String,
    pub role: Role,
    pub invited_by: String,
    pub expires_at: DateTime<Utc>,
}

impl From<MyInvite> for MyInviteView {
    fn from(i: MyInvite) -> Self {
        Self { id: i.id, board_id: i.space_id, board_name: i.space_name, role: i.role, invited_by: i.invited_by, expires_at: i.expires_at }
    }
}

/// Invitations waiting for you. Empty when signed out.
#[tauri::command]
pub async fn board_invitations(account: State<'_, Account>) -> Result<Vec<MyInviteView>> {
    if account.user_id().await.is_none() {
        return Ok(Vec::new());
    }
    Ok(account.my_invites().await?.into_iter().map(MyInviteView::from).collect())
}

/// Joins a board. Its cards arrive with the sync that starts straight away.
#[tauri::command]
pub async fn board_accept_invite(engine: State<'_, SyncEngine>, db: State<'_, Db>, account: State<'_, Account>, invite_id: String) -> Result<LocalSpace> {
    let board = accept_invite(&db.conn().await?, &account, &invite_id).await?;
    engine.wake();
    Ok(board)
}

#[tauri::command]
pub async fn board_decline_invite(account: State<'_, Account>, invite_id: String) -> Result<()> {
    Ok(account.decline_invite(&invite_id).await?)
}
