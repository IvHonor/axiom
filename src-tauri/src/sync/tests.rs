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
    local::apply(&laptop.db, &page.records, page.cursor).await.unwrap();
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
