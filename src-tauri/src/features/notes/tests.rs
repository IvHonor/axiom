//! Tests for Notes against a throwaway in-memory database.

use sea_orm::{ConnectOptions, Database, DatabaseConnection};

use super::service::*;
use super::types::{NewNote, NoteChange, NoteFilter, Shelf};

async fn setup() -> DatabaseConnection {
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

fn on(shelf: Shelf) -> NoteFilter {
    NoteFilter { shelf, ..Default::default() }
}

async fn note(db: &DatabaseConnection, title: &str, text: &str) -> String {
    let n = create(db, NewNote { title: title.into(), ..Default::default() }).await.unwrap();
    save(db, &n.id, Some("AQID".into()), text.into(), text.split_whitespace().count() as i32).await.unwrap();
    n.id
}

#[tokio::test]
async fn notes_are_found_by_words_tags_and_folder() {
    let db = setup().await;
    let uni = create_folder(&db, "Uni", None).await.unwrap();
    let maths = create_folder(&db, "Maths", Some(uni.id.clone())).await.unwrap();
    let a = note(&db, "Lecture 3", "Eigenvalues and eigenvectors").await;
    change(&db, &a, NoteChange { folder_id: Some(maths.id.clone()), tags: Some(vec!["#Exam".into(), "exam".into(), "Week 3".into()]), ..Default::default() }).await.unwrap();
    let b = note(&db, "Shopping", "Milk, eggs").await;
    change(&db, &b, NoteChange { pinned: Some(true), ..Default::default() }).await.unwrap();

    let all = list(&db, NoteFilter::default()).await.unwrap();
    assert_eq!(all[0].id, b, "pinned first");
    assert_eq!(all[1].tags, ["exam", "week-3"]);
    let found = |f: NoteFilter| {
        let db = db.clone();
        async move { list(&db, f).await.unwrap().into_iter().map(|n| n.id).collect::<Vec<_>>() }
    };
    assert_eq!(found(NoteFilter { search: Some("EIGEN lecture".into()), ..Default::default() }).await, [a.as_str()]);
    assert_eq!(found(NoteFilter { tag: Some("#exam".into()), ..Default::default() }).await, [a.as_str()]);
    assert_eq!(found(NoteFilter { folder: Some(uni.id.clone()), ..Default::default() }).await, [a.as_str()], "subfolders count");
    assert_eq!(found(NoteFilter { folder: Some("none".into()), ..Default::default() }).await, [b.as_str()]);
    assert_eq!(found(NoteFilter { sort: Some("title".into()), ..Default::default() }).await, [b.as_str(), a.as_str()], "pinned still first");

    let s = state(&db).await.unwrap();
    assert_eq!((s.notes, s.unfiled, s.folders.len()), (2, 1, 2));
    assert_eq!(s.folders.iter().find(|f| f.id == maths.id).unwrap().count, 1);
    assert_eq!(s.tags[0].tag, "exam");
}

#[tokio::test]
async fn links_lead_back() {
    let db = setup().await;
    let target = note(&db, "Reading list", "Books to get").await;
    let from = note(&db, "", "Ideas\nSee [[reading LIST]] for more").await;
    note(&db, "Other", "Nothing here").await;
    let detail = get(&db, &target).await.unwrap();
    assert_eq!(detail.backlinks.len(), 1);
    assert_eq!((detail.backlinks[0].id.as_str(), detail.backlinks[0].title.as_str()), (from.as_str(), "Ideas"), "untitled notes go by their first line");
    let names: Vec<String> = titles(&db).await.unwrap().into_iter().map(|t| t.title).collect();
    assert!(names.contains(&"Reading list".into()) && names.contains(&"Ideas".into()));
}

#[tokio::test]
async fn sticky_notes_go_on_the_overview_up_to_a_limit() {
    let db = setup().await;
    let s = create(&db, NewNote { sticky: true, on_overview: true, ..Default::default() }).await.unwrap();
    assert_eq!(s.color, "yellow", "stickies start yellow");
    assert!(change(&db, &s.id, NoteChange { color: Some("tartan".into()), ..Default::default() }).await.is_err());
    change(&db, &s.id, NoteChange { color: Some("Pink".into()), ..Default::default() }).await.unwrap();
    assert_eq!(list(&db, on(Shelf::Overview)).await.unwrap()[0].color, "pink");

    // A plain note can't sit on the overview.
    let plain = create(&db, NewNote { on_overview: true, ..Default::default() }).await.unwrap();
    assert!(!plain.on_overview && plain.color.is_empty());
    assert_eq!(list(&db, on(Shelf::Stickies)).await.unwrap().len(), 1);
    assert_eq!(list(&db, on(Shelf::Notes)).await.unwrap().len(), 1);

    for _ in 1..MAX_ON_OVERVIEW {
        create(&db, NewNote { sticky: true, on_overview: true, ..Default::default() }).await.unwrap();
    }
    assert!(create(&db, NewNote { sticky: true, on_overview: true, ..Default::default() }).await.is_err(), "full");
    let off = create(&db, NewNote { sticky: true, ..Default::default() }).await.unwrap();
    assert!(change(&db, &off.id, NoteChange { on_overview: Some(true), ..Default::default() }).await.is_err());
    change(&db, &s.id, NoteChange { on_overview: Some(false), ..Default::default() }).await.unwrap();
    change(&db, &off.id, NoteChange { on_overview: Some(true), ..Default::default() }).await.unwrap();
}

#[tokio::test]
async fn the_trash_keeps_notes_until_emptied() {
    let db = setup().await;
    let f = create_folder(&db, "Work", None).await.unwrap();
    let n = create(&db, NewNote { folder_id: Some(f.id.clone()), sticky: true, on_overview: true, ..Default::default() }).await.unwrap();
    trash(&db, &n.id).await.unwrap();
    assert!(list(&db, NoteFilter::default()).await.unwrap().is_empty());
    assert!(list(&db, on(Shelf::Overview)).await.unwrap().is_empty(), "off the overview");
    assert_eq!(list(&db, on(Shelf::Trash)).await.unwrap().len(), 1);
    assert_eq!(state(&db).await.unwrap().trash, 1, "not old enough to go");

    delete_folder(&db, &f.id).await.unwrap();
    let back = restore(&db, &n.id).await.unwrap();
    assert_eq!(back.folder_id, None, "its folder went meanwhile");

    trash(&db, &n.id).await.unwrap();
    assert_eq!(empty_trash(&db, None).await.unwrap(), 1);
    assert!(get(&db, &n.id).await.is_err());
}

#[tokio::test]
async fn folders_nest_and_give_up_their_notes_when_deleted() {
    let db = setup().await;
    let top = create_folder(&db, "Projects", None).await.unwrap();
    let mid = create_folder(&db, "Axiom", Some(top.id.clone())).await.unwrap();
    let low = create_folder(&db, "Ideas", Some(mid.id.clone())).await.unwrap();
    assert!(move_folder(&db, &top.id, Some(low.id.clone())).await.is_err(), "not inside itself");
    assert!(create_folder(&db, "  ", None).await.is_err());
    let n = create(&db, NewNote { folder_id: Some(mid.id.clone()), ..Default::default() }).await.unwrap();

    delete_folder(&db, &mid.id).await.unwrap();
    assert_eq!(get(&db, &n.id).await.unwrap().note.folder_id, Some(top.id.clone()), "moved up");
    let folders = state(&db).await.unwrap().folders;
    assert_eq!(folders.iter().find(|f| f.id == low.id).unwrap().parent_id, Some(top.id.clone()));
    rename_folder(&db, &low.id, "Someday").await.unwrap();
    assert!(change(&db, &n.id, NoteChange { folder_id: Some(mid.id), ..Default::default() }).await.is_err(), "gone");
    change(&db, &n.id, NoteChange { folder_id: Some(String::new()), ..Default::default() }).await.unwrap();
    assert_eq!(get(&db, &n.id).await.unwrap().note.folder_id, None);
}

#[tokio::test]
async fn edits_squash_and_split() {
    let db = setup().await;
    let n = create(&db, NewNote::default()).await.unwrap();
    let big: String = "ABCD".repeat(crate::features::doc_edits::CHUNK / 2 + 10);
    save(&db, &n.id, Some(big.clone()), "…".into(), 1).await.unwrap();
    save(&db, &n.id, Some("two".into()), "…".into(), 1).await.unwrap();
    let detail = get(&db, &n.id).await.unwrap();
    assert_eq!(detail.edits.len(), 2);
    assert!(detail.edits.iter().any(|e| e.data == big && e.ids.len() == 3));
    let seen: Vec<String> = detail.edits.into_iter().flat_map(|e| e.ids).collect();
    save(&db, &n.id, Some("three".into()), "…".into(), 1).await.unwrap();
    compact(&db, &n.id, "all", seen).await.unwrap();
    let left: Vec<String> = get(&db, &n.id).await.unwrap().edits.into_iter().map(|e| e.data).collect();
    assert_eq!(left.len(), 2);
    assert!(left.contains(&"three".to_owned()) && left.contains(&"all".to_owned()));
}
