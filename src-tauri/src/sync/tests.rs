//! Sync end to end: separate "computers", each with its own local database
//! and account, syncing through a real server on a random local port.

use sea_orm::{ConnectOptions, Database, DatabaseConnection};

use super::*;
use crate::account::store::Memory;
use crate::features::project_board::service as board;
use crate::features::project_board::types::TaskFields;

const EMAIL: &str = "ada@example.com";
const PASSWORD: &str = "correct horse";

async fn start_server() -> String {
    let db = axiom_server::db::connect("sqlite::memory:").await.unwrap();
    let state = axiom_server::AppState::from(axiom_server::Shared::new(db, b"test-secret-that-is-at-least-32-bytes"));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(axiom_server::serve(listener, state));
    url
}

struct Computer {
    db: DatabaseConnection,
    account: Account,
    server: String,
}

impl Computer {
    /// A fresh install: empty database, signed out.
    async fn new(server: &str) -> Self {
        let mut options = ConnectOptions::new("sqlite::memory:");
        options.max_connections(1).sqlx_logging(false);
        let db = Database::connect(options).await.unwrap();
        crate::db::prepare(&db).await.unwrap();
        Self { db, account: Account::new(server, Box::new(Memory::default())), server: server.into() }
    }

    async fn sign_in(&self) {
        if self.account.sign_in(EMAIL, PASSWORD).await.is_err() {
            self.account.sign_up(EMAIL, PASSWORD).await.unwrap();
        }
    }

    async fn sync(&self) -> Outcome {
        sync_once(&self.db, &self.account, || {}).await.unwrap()
    }

    async fn project_names(&self) -> Vec<String> {
        board::list_projects(&self.db).await.unwrap().into_iter().map(|p| p.name).collect()
    }

    async fn task(&self, project_id: &str) -> crate::features::project_board::types::TaskCard {
        board::get_board(&self.db, project_id).await.unwrap().tasks.remove(0)
    }
}

fn fields_of(task: &crate::features::project_board::types::TaskCard) -> TaskFields {
    TaskFields {
        title: task.task.title.clone(),
        description: task.task.description.clone(),
        priority: task.task.priority,
        start_date: task.task.start_date,
        due_date: task.task.due_date,
        estimate: task.task.estimate,
        recurrence: task.task.recurrence.clone(),
    }
}

/// Two signed-in computers sharing a project with one task.
async fn two_computers_sharing_a_task() -> (Computer, Computer, String) {
    let server = start_server().await;
    let (laptop, desktop) = (Computer::new(&server).await, Computer::new(&server).await);
    laptop.sign_in().await;
    desktop.sign_in().await;
    // Empty computers link to the account without asking.
    assert_eq!(laptop.sync().await, Outcome::Synced { applied: 0 });
    assert_eq!(desktop.sync().await, Outcome::Synced { applied: 0 });

    let project = board::create_project(&laptop.db, "Thesis").await.unwrap();
    let column = board::get_board(&laptop.db, &project.id).await.unwrap().columns[0].id.clone();
    board::create_task(&laptop.db, &column, "Write intro").await.unwrap();
    laptop.sync().await;
    desktop.sync().await;
    (laptop, desktop, project.id)
}

#[tokio::test]
async fn a_project_made_on_one_computer_appears_on_the_other() {
    let (_laptop, desktop, project_id) = two_computers_sharing_a_task().await;
    assert_eq!(desktop.project_names().await, ["Thesis"]);
    let board = board::get_board(&desktop.db, &project_id).await.unwrap();
    assert_eq!(board.columns.len(), 4, "with its columns");
    assert_eq!(board.tasks[0].task.title, "Write intro");
}

#[tokio::test]
async fn edits_to_different_fields_on_two_computers_both_survive() {
    let (laptop, desktop, project_id) = two_computers_sharing_a_task().await;
    let task = laptop.task(&project_id).await;

    // Both offline: the laptop renames the task, the desktop raises its priority.
    board::update_task(&laptop.db, &task.task.id, TaskFields { title: "Write introduction".into(), ..fields_of(&task) }).await.unwrap();
    board::update_task(&desktop.db, &task.task.id, TaskFields { priority: 3, ..fields_of(&task) }).await.unwrap();

    laptop.sync().await;
    desktop.sync().await;
    laptop.sync().await;

    for computer in [&laptop, &desktop] {
        let task = computer.task(&project_id).await;
        assert_eq!((task.task.title.as_str(), task.task.priority), ("Write introduction", 3));
    }
}

#[tokio::test]
async fn deletes_sync_too() {
    let (laptop, desktop, project_id) = two_computers_sharing_a_task().await;
    let task = laptop.task(&project_id).await;
    board::delete_task(&laptop.db, &task.task.id).await.unwrap();
    laptop.sync().await;
    // The task, plus the activity entry recording its deletion.
    assert_eq!(desktop.sync().await, Outcome::Synced { applied: 2 });
    assert!(board::get_board(&desktop.db, &project_id).await.unwrap().tasks.is_empty());
}

#[tokio::test]
async fn nothing_to_do_sends_nothing_and_changes_nothing() {
    let (laptop, desktop, _) = two_computers_sharing_a_task().await;
    assert_eq!(laptop.sync().await, Outcome::Synced { applied: 0 }, "it got its own rows back already");
    assert_eq!(desktop.sync().await, Outcome::Synced { applied: 0 });
    assert!(!local::has_pending(&laptop.db).await.unwrap(), "pulled rows aren't queued to push back");
}

#[tokio::test]
async fn an_unpushed_edit_is_never_overwritten_by_a_pull() {
    let (laptop, desktop, project_id) = two_computers_sharing_a_task().await;
    let task = laptop.task(&project_id).await;
    board::update_task(&laptop.db, &task.task.id, TaskFields { title: "Laptop".into(), ..fields_of(&task) }).await.unwrap();
    board::update_task(&desktop.db, &task.task.id, TaskFields { description: "Desktop notes".into(), ..fields_of(&task) }).await.unwrap();
    desktop.sync().await;

    // The laptop pulls the desktop's version while its own edit is unpushed.
    let page = laptop.account.pull(0).await.unwrap();
    local::apply(&laptop.db, &page.records, local::Cursor::Account(page.cursor)).await.unwrap();
    assert_eq!(laptop.task(&project_id).await.task.title, "Laptop", "the local edit is kept");

    // Its next sync pushes the edit and brings back the merged row.
    laptop.sync().await;
    let merged = laptop.task(&project_id).await;
    assert_eq!((merged.task.title.as_str(), merged.task.description.as_str()), ("Laptop", "Desktop notes"));
}

#[tokio::test]
async fn data_made_before_signing_in_waits_for_a_choice_then_merges() {
    let (laptop, _, _) = two_computers_sharing_a_task().await;
    let newcomer = Computer::new(&laptop.server).await;
    board::create_project(&newcomer.db, "Groceries").await.unwrap();
    newcomer.sign_in().await;

    assert_eq!(newcomer.sync().await, Outcome::NeedsChoice { projects: 1, plan_tasks: 0 });
    local::link(&newcomer.db, &newcomer.account.user_id().await.unwrap(), Link::Merge).await.unwrap();
    newcomer.sync().await;

    let mut names = newcomer.project_names().await;
    names.sort();
    assert_eq!(names, ["Groceries", "Thesis"]);
    laptop.sync().await;
    let mut names = laptop.project_names().await;
    names.sort();
    assert_eq!(names, ["Groceries", "Thesis"], "and it reached the account");
}

#[tokio::test]
async fn replacing_local_data_keeps_only_the_accounts() {
    let (laptop, _, _) = two_computers_sharing_a_task().await;
    let newcomer = Computer::new(&laptop.server).await;
    board::create_project(&newcomer.db, "Scratch").await.unwrap();
    newcomer.sign_in().await;

    local::link(&newcomer.db, &newcomer.account.user_id().await.unwrap(), Link::Replace).await.unwrap();
    newcomer.sync().await;
    assert_eq!(newcomer.project_names().await, ["Thesis"]);
    laptop.sync().await;
    assert_eq!(laptop.project_names().await, ["Thesis"], "the replaced data never reached the account");
}

#[tokio::test]
async fn export_has_every_live_row_and_no_deleted_ones() {
    let computer = Computer::new("http://127.0.0.1:1").await;
    let kept = board::create_project(&computer.db, "Kept").await.unwrap();
    let gone = board::create_project(&computer.db, "Gone").await.unwrap();
    board::delete_project(&computer.db, &gone.id).await.unwrap();

    let tables = local::export(&computer.db).await.unwrap();
    let projects = tables["project_board_projects"].as_array().unwrap();
    assert_eq!(projects.len(), 1);
    assert_eq!(projects[0]["name"], "Kept");
    assert_eq!(projects[0]["id"], kept.id.as_str());
    assert_eq!(tables["project_board_columns"].as_array().unwrap().len(), 4, "the kept project's columns");
    assert_eq!(tables.len(), TABLES.len(), "every synced table is included");
}

#[tokio::test]
async fn signing_out_and_removing_data_empties_this_computer_only() {
    let (laptop, desktop, _) = two_computers_sharing_a_task().await;
    desktop.account.sign_out().await;
    local::wipe(&desktop.db).await.unwrap();
    assert!(desktop.project_names().await.is_empty());
    assert_eq!(desktop.sync().await, Outcome::SignedOut);

    // Signing back in on the empty computer downloads everything again.
    desktop.sign_in().await;
    desktop.sync().await;
    assert_eq!(desktop.project_names().await, ["Thesis"]);
    assert_eq!(laptop.project_names().await, ["Thesis"]);
}

#[tokio::test]
async fn daily_plans_sync_too() {
    use crate::features::daily_plan::service as plan;
    let (laptop, desktop, _) = two_computers_sharing_a_task().await;
    let today = chrono::NaiveDate::from_ymd_opt(2026, 10, 22).unwrap();
    plan::quick_add(&laptop.db, "Write report 45m 2pm !", today, today).await.unwrap();
    laptop.sync().await;
    desktop.sync().await;

    let day = plan::get_day(&desktop.db, today, today).await.unwrap();
    assert_eq!(day.tasks[0].title, "Write report");
    assert_eq!(day.tasks[0].focus_rank, Some(1));
    assert_eq!(day.blocks[0].start_minute, 14 * 60);
}

// ---------- Shared boards ----------

use axiom_protocol::{Change, NewInvite, Role};

impl Computer {
    async fn sign_in_as(&self, email: &str) {
        if self.account.sign_in(email, PASSWORD).await.is_err() {
            self.account.sign_up(email, PASSWORD).await.unwrap();
        }
        assert!(matches!(self.sync().await, Outcome::Synced { .. }));
    }

    /// A row as exported, to build others from.
    async fn exported(&self, table: &str, id: &str) -> serde_json::Map<String, serde_json::Value> {
        let tables = local::export(&self.db).await.unwrap();
        tables[table].as_array().unwrap().iter().find(|r| r["id"] == id).unwrap().as_object().unwrap().clone()
    }
}

/// Ada shares "Website" (one card) with Bob as `role`.
async fn shared_with_bob(role: Role) -> (Computer, Computer, String, String) {
    let server = start_server().await;
    let (ada, bob) = (Computer::new(&server).await, Computer::new(&server).await);
    ada.sign_in_as("ada@example.com").await;
    bob.sign_in_as("bob@example.com").await;
    let project = board::create_project(&ada.db, "Website").await.unwrap();
    let column = board::get_board(&ada.db, &project.id).await.unwrap().columns[0].id.clone();
    let card = board::create_task(&ada.db, &column, "Fix footer").await.unwrap().task.id;
    // Synced to her account first, so sharing has rows to move.
    ada.sync().await;
    sharing::share(&ada.db, &ada.account, &project.id).await.unwrap();
    ada.sync().await;
    ada.account.invite(&project.id, &NewInvite { email: "bob@example.com".into(), role }).await.unwrap();
    let invite = bob.account.my_invites().await.unwrap().remove(0);
    assert_eq!(invite.space_name, "Website");
    sharing::accept_invite(&bob.db, &bob.account, &invite.id).await.unwrap();
    bob.sync().await;
    (ada, bob, project.id, card)
}

#[tokio::test]
async fn a_shared_board_reaches_the_people_on_it() {
    let (ada, bob, project, card) = shared_with_bob(Role::Editor).await;
    assert_eq!(bob.project_names().await, ["Website"]);
    assert_eq!(bob.task(&project).await.task.title, "Fix footer");

    // Bob edits the card; Ada gets it.
    let mut fields = fields_of(&bob.task(&project).await);
    fields.title = "Fix footer links".into();
    board::update_task(&bob.db, &card, fields).await.unwrap();
    bob.sync().await;
    ada.sync().await;
    assert_eq!(ada.task(&project).await.task.title, "Fix footer links");

    // Ada's other computer gets the board once, through the board, not her account.
    let laptop = Computer::new(&ada.server).await;
    laptop.sign_in_as("ada@example.com").await;
    assert_eq!(laptop.project_names().await, ["Website"]);
    assert_eq!(board::get_board(&laptop.db, &project).await.unwrap().tasks.len(), 1);
    assert_eq!(spaces::role_of(&laptop.db, &project).await.unwrap(), Some(Role::Owner));
}

#[tokio::test]
async fn viewers_see_a_shared_board_but_cannot_change_it() {
    use crate::features::project_board::access::{self, Need};
    let (ada, bob, project, card) = shared_with_bob(Role::Viewer).await;
    assert_eq!(bob.task(&project).await.task.title, "Fix footer");

    // The app says no straight away...
    let refused = access::task(&bob.db, &card, Need::Cards).await.unwrap_err();
    assert!(refused.to_string().contains("view this board"), "{refused}");

    // ...and an edit that gets past it anyway is refused by the server, and
    // the board's own version comes back.
    let mut fields = fields_of(&bob.task(&project).await);
    fields.title = "Changed by a viewer".into();
    board::update_task(&bob.db, &card, fields).await.unwrap();
    bob.sync().await;
    assert_eq!(bob.task(&project).await.task.title, "Fix footer");
    ada.sync().await;
    assert_eq!(ada.task(&project).await.task.title, "Fix footer");

    // Made an editor, Bob can.
    let bob_id = ada.account.members(&project).await.unwrap().members.into_iter().find(|m| !m.you).unwrap().user_id;
    ada.account.change_role(&project, &bob_id, Role::Editor).await.unwrap();
    bob.sync().await;
    assert!(access::task(&bob.db, &card, Need::Cards).await.is_ok());
    assert!(access::task(&bob.db, &card, Need::Board).await.is_err());
}

#[tokio::test]
async fn removed_members_lose_the_board_and_the_owner_keeps_it() {
    let (ada, bob, project, _) = shared_with_bob(Role::Editor).await;
    let bob_id = ada.account.members(&project).await.unwrap().members.into_iter().find(|m| !m.you).unwrap().user_id;
    ada.account.remove_member(&project, &bob_id).await.unwrap();
    bob.sync().await;
    assert!(bob.project_names().await.is_empty());
    assert!(spaces::list(&bob.db).await.unwrap().is_empty());

    // Stopping sharing: Ada keeps the board, back among her own projects.
    sharing::stop_sharing(&ada.db, &ada.account, &project).await.unwrap();
    ada.sync().await;
    assert_eq!(ada.project_names().await, ["Website"]);
    let laptop = Computer::new(&ada.server).await;
    laptop.sign_in_as("ada@example.com").await;
    assert_eq!(laptop.project_names().await, ["Website"]);
    assert_eq!(laptop.task(&project).await.task.title, "Fix footer");
    assert!(spaces::list(&laptop.db).await.unwrap().is_empty());
}

#[tokio::test]
async fn a_shared_board_cannot_reach_into_your_own_projects() {
    let (ada, bob, project, card) = shared_with_bob(Role::Editor).await;
    let mine = board::create_project(&bob.db, "Private").await.unwrap();
    let my_column = board::get_board(&bob.db, &mine.id).await.unwrap().columns[0].id.clone();
    let secret = board::create_task(&bob.db, &my_column, "Secret").await.unwrap().task.id;
    bob.sync().await;
    board::add_checklist_item(&ada.db, &card, "Real item").await.unwrap();
    ada.sync().await;

    // Ada's app turns hostile: rows aimed at Bob's own project and card,
    // next to one honest row that should arrive.
    let task = ada.exported("project_board_tasks", &card).await;
    let item_id = local::export(&ada.db).await.unwrap()["project_board_checklist_items"][0]["id"].as_str().unwrap().to_owned();
    let item = ada.exported("project_board_checklist_items", &item_id).await;
    let with = |mut row: serde_json::Map<String, serde_json::Value>, changes: serde_json::Value| {
        for (k, v) in changes.as_object().unwrap() {
            row.insert(k.clone(), v.clone());
        }
        row
    };
    let change = |table: &str, fields: serde_json::Map<String, serde_json::Value>| Change {
        table: table.into(),
        id: fields["id"].as_str().unwrap().into(),
        fields,
        changed_at: chrono::Utc::now().timestamp_millis(),
    };
    let rows = vec![
        change("project_board_tasks", with(task.clone(), serde_json::json!({ "id": "honest-1", "title": "Honest card" }))),
        change(
            "project_board_tasks",
            with(task.clone(), serde_json::json!({ "id": "evil-1", "project_id": mine.id, "column_id": my_column, "title": "Injected" })),
        ),
        change("project_board_checklist_items", with(item, serde_json::json!({ "id": "evil-2", "task_id": secret, "text": "Injected" }))),
        // Bob's own card, claimed for the shared board.
        change("project_board_tasks", with(task, serde_json::json!({ "id": secret, "title": "Taken over" }))),
    ];
    ada.account.space_push(&project, &PushRequest { changes: rows }).await.unwrap();
    bob.sync().await;

    let shared: Vec<String> = board::get_board(&bob.db, &project).await.unwrap().tasks.into_iter().map(|t| t.task.title).collect();
    assert!(shared.contains(&"Honest card".to_owned()), "{shared:?}");
    let private = board::get_board(&bob.db, &mine.id).await.unwrap();
    let titles: Vec<&str> = private.tasks.iter().map(|t| t.task.title.as_str()).collect();
    assert_eq!(titles, ["Secret"]);
    assert_eq!(private.tasks[0].checklist_total, 0);
}

#[tokio::test]
async fn signing_in_as_someone_else_removes_shared_boards() {
    let (_ada, bob, _project, _) = shared_with_bob(Role::Editor).await;
    bob.account.sign_out().await;
    bob.account.sign_up("cy@example.com", PASSWORD).await.unwrap();
    // Cy keeps what's on this computer, but not boards shared with Bob.
    local::link(&bob.db, &bob.account.user_id().await.unwrap(), Link::Merge).await.unwrap();
    bob.sync().await;
    assert!(bob.project_names().await.is_empty());
    assert!(spaces::list(&bob.db).await.unwrap().is_empty());
}
