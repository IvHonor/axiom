//! Each area's tools against a real (in-memory) database: what the preview
//! says, and that confirming does exactly that.

use chrono::NaiveDate;
use sea_orm::{ConnectOptions, Database, DatabaseConnection};
use serde_json::json;

use super::*;

const TODAY: (i32, u32, u32) = (2026, 10, 22);

async fn db() -> DatabaseConnection {
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

fn ctx(db: &DatabaseConnection) -> Ctx<'_> {
    // Nothing listens here: a test that needs Open Library gives it its own.
    ctx_with(db, crate::features::reading::library::OpenLibrary::with_urls("http://127.0.0.1:9", "http://127.0.0.1:9", None))
}

fn ctx_with(db: &DatabaseConnection, library: crate::features::reading::library::OpenLibrary) -> Ctx<'_> {
    Ctx { db, today: NaiveDate::from_ymd_opt(TODAY.0, TODAY.1, TODAY.2).unwrap(), now_minute: 8 * 60, library }
}

fn spec(name: &str) -> Spec {
    let all = specs(&AREAS.iter().map(|(id, _)| id.to_string()).collect::<Vec<_>>());
    all.into_iter().find(|s| s.name == name).unwrap_or_else(|| panic!("no tool {name}"))
}

/// Previews, then confirms, the way the chat does.
async fn change(ctx: &Ctx<'_>, name: &str, args: serde_json::Value) -> (Preview, serde_json::Value) {
    let spec = spec(name);
    assert!(spec.change, "{name} changes things");
    let preview = preview(ctx, &spec, &args).await.unwrap_or_else(|e| panic!("{name}: {e}"));
    let done = apply(ctx, spec.area, spec.name, &args).await.unwrap_or_else(|e| panic!("{name}: {e}"));
    (preview, done)
}

async fn look(ctx: &Ctx<'_>, name: &str, args: serde_json::Value) -> serde_json::Value {
    let spec = spec(name);
    assert!(!spec.change, "{name} only looks");
    read(ctx, &spec, &args).await.unwrap_or_else(|e| panic!("{name}: {e}"))
}

fn item<'a>(p: &'a Preview, label: &str) -> &'a Item {
    p.items.iter().find(|i| i.label == label).unwrap_or_else(|| panic!("no {label} in {p:?}"))
}

#[test]
fn only_allowed_areas_get_tools() {
    let names: Vec<&str> = specs(&["birthdays".into()]).iter().map(|s| s.name).collect();
    assert!(!names.is_empty() && names.iter().all(|n| n.starts_with("birthdays_")), "{names:?}");
    assert!(specs(&[]).is_empty());
    // Journal and Notes can be written in, but only added to: nothing there is ever rewritten or removed.
    let writing: Vec<&str> = specs(&["journal".into(), "notes".into()]).iter().filter(|s| s.change).map(|s| s.name).collect();
    assert_eq!(writing, ["journal_write", "journal_add_to", "notes_write", "notes_add_to"]);
}

#[tokio::test]
async fn birthdays_are_added_changed_and_removed() {
    let db = db().await;
    let ctx = ctx(&db);
    let (p, added) = change(&ctx, "birthdays_add", json!({ "name": "Ada Lovelace", "month": 12, "day": 10, "year": 1995, "relation": "friend" })).await;
    assert_eq!(p.title, "Add Ada Lovelace's birthday");
    assert_eq!(item(&p, "Date").after.as_deref(), Some("10 December 1995"));
    assert_eq!(item(&p, "Reminder").after.as_deref(), Some("7 days before"));
    let id = added["id"].as_str().unwrap().to_owned();

    // Refused at the preview, exactly as saving would refuse it.
    for wrong in [json!({ "name": "Nobody", "month": 2, "day": 30 }), json!({ "name": "Ada", "month": 12, "day": 10, "year": 1815 })] {
        assert!(preview(&ctx, &spec("birthdays_add"), &wrong).await.is_err(), "{wrong}");
    }

    let (p, _) = change(&ctx, "birthdays_update", json!({ "id": id, "notes": "Loves maths" })).await;
    assert_eq!(p.items, vec![Item::new("Notes", "Loves maths")]);
    let list = look(&ctx, "birthdays_list", json!({})).await;
    assert_eq!(list[0]["notes"], "Loves maths");

    let (p, _) = change(&ctx, "birthdays_delete", json!({ "id": id })).await;
    assert_eq!(p.title, "Remove Ada Lovelace's birthday");
    assert_eq!(look(&ctx, "birthdays_list", json!({})).await, json!([]));
}

#[tokio::test]
async fn a_day_is_planned_onto_the_timeline() {
    let db = db().await;
    let ctx = ctx(&db);
    let items = json!({ "items": [
        { "title": "Write report", "start": "09:00", "minutes": 60, "due": "2026-10-24" },
        { "title": "Lunch", "start": "12:30", "minutes": 45, "time_only": true },
        { "title": "Email Bob", "day": "2026-10-23" },
    ] });
    let (p, _) = change(&ctx, "plan_add", items).await;
    assert_eq!(p.title, "Add 3 items to the plan");
    assert_eq!(p.items[0].after.as_deref(), Some("Write report · Today · 09:00–10:00 · due Sat 24 Oct"));
    assert_eq!(p.items[1], Item::new("Block", "Lunch · Today · 12:30–13:15"));
    assert_eq!(p.items[2].after.as_deref(), Some("Email Bob · Tomorrow"));

    let today = look(&ctx, "plan_day", json!({})).await;
    assert_eq!(today["tasks"].as_array().unwrap().len(), 1);
    assert_eq!(today["blocks"].as_array().unwrap().len(), 2);
    let report = today["tasks"][0]["id"].as_str().unwrap().to_owned();

    let bad = preview(&ctx, &spec("plan_add"), &json!({ "items": [{ "title": "Late", "start": "25:00" }] })).await;
    assert!(bad.is_err());

    let (p, _) = change(&ctx, "plan_update_task", json!({ "id": report, "done": true })).await;
    assert_eq!(p.items, vec![Item::change("Status", "To do", "Done")]);
    assert_eq!(look(&ctx, "plan_day", json!({})).await["tasks"][0]["done"], true);

    let week = look(&ctx, "plan_week", json!({ "days": 2 })).await;
    assert_eq!(week["days"][1]["tasks"][0]["title"], "Email Bob");
}

#[tokio::test]
async fn goals_are_added_and_checked_in_on() {
    let db = db().await;
    let ctx = ctx(&db);
    let (p, goal) = change(&ctx, "goals_add", json!({ "title": "Run 100 km", "area": "health", "kind": "target", "start_value": 0, "target_value": 100, "unit": "km" })).await;
    assert_eq!(item(&p, "Target").after.as_deref(), Some("0 km → 100 km"));
    let id = goal["id"].as_str().unwrap().to_owned();
    let (p, after) = change(&ctx, "goals_check_in", json!({ "id": id, "value": 5, "note": "Park run" })).await;
    assert_eq!(item(&p, "Value").after.as_deref(), Some("5 km"));
    assert_eq!(after["current"], 5.0);
}

#[tokio::test]
async fn books_are_added_and_moved_between_shelves() {
    let db = db().await;
    let ctx = ctx(&db);
    let (p, book) = change(&ctx, "reading_add", json!({ "title": "Dune", "authors": "Frank Herbert", "pages": 600 })).await;
    assert_eq!(item(&p, "Shelf").after.as_deref(), Some("Want to read"));
    let id = book["id"].as_str().unwrap().to_owned();
    let (p, _) = change(&ctx, "reading_move", json!({ "id": id, "shelf": "reading" })).await;
    assert_eq!(p.items, vec![Item::change("Shelf", "Want to read", "Reading")]);
    let (_, logged) = change(&ctx, "reading_log", json!({ "id": id, "at": 120 })).await;
    assert_eq!(logged["at"], 120);

    // Added finished with a review: a rating the AI sends anyway ("very good" as 4.5) is left off.
    let (p, done) = change(&ctx, "reading_add", json!({ "title": "Think and Grow Rich", "shelf": "finished", "rating": 4.5, "review": "Very good." })).await;
    assert!(p.items.iter().all(|i| i.label != "Rating"), "{p:?}");
    assert_eq!(item(&p, "Review").after.as_deref(), Some("Very good."));
    assert_eq!((done["shelf"].as_str(), done["rating_out_of_5"].as_f64()), (Some("finished"), None));
    let (p, _) = change(&ctx, "reading_review", json!({ "id": id, "rating": 3 })).await;
    assert_eq!(p.items, vec![Item::new("Rating", "★★★ (3/5)")]);
}

/// A known book is found on Open Library and added with its details, not
/// made up; only a book that isn't there is added by hand.
#[tokio::test]
async fn books_are_found_on_open_library_first() {
    use wiremock::matchers::{method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};
    let server = MockServer::start().await;
    let atomic = json!({ "docs": [{ "key": "/works/OL17930368W", "title": "Atomic Habits", "author_name": ["James Clear"], "cover_i": 12539702, "number_of_pages_median": 320, "first_publish_year": 2016, "edition_count": 45 }] });
    for q in ["atomic habits", "Atomic Habits James Clear"] {
        Mock::given(method("GET")).and(path("/search.json")).and(query_param("q", q)).respond_with(ResponseTemplate::new(200).set_body_json(atomic.clone())).mount(&server).await;
    }
    Mock::given(method("GET")).and(path("/search.json")).respond_with(ResponseTemplate::new(200).set_body_json(json!({ "docs": [] }))).mount(&server).await;
    let db = db().await;
    let ctx = ctx_with(&db, crate::features::reading::library::OpenLibrary::with_urls(&server.uri(), "https://covers.example", None));

    let found = look(&ctx, "reading_find", json!({ "query": "atomic habits" })).await;
    assert_eq!((found["found"][0]["work_key"].as_str(), found["found"][0]["cover"].as_bool()), (Some("/works/OL17930368W"), Some(true)));
    // The AI's own words for it don't count: Open Library's details are used.
    let (p, added) = change(&ctx, "reading_add", json!({ "work_key": "/works/OL17930368W", "title": "Atomic Habits", "authors": "James Clear", "pages": 9999 })).await;
    assert_eq!((p.title.as_str(), item(&p, "Pages").after.as_deref(), item(&p, "Details").after.as_deref()), ("Add a book", Some("320"), Some("From Open Library, with its cover")));
    let saved = crate::features::reading::service::get_book(&db, added["id"].as_str().unwrap(), ctx.today).await.unwrap().card.book;
    assert_eq!((saved.work_key.as_deref(), saved.cover_url.as_deref(), saved.published_year), (Some("/works/OL17930368W"), Some("https://covers.example/b/id/12539702-M.jpg"), Some(2016)));

    // A work_key that isn't really that book is refused, not added anyway.
    assert!(preview(&ctx, &spec("reading_add"), &json!({ "work_key": "/works/OL1W", "title": "Atomic Habits" })).await.is_err());
    // Not on Open Library: says so, and a book added without a work_key is the person's own.
    let none = look(&ctx, "reading_find", json!({ "query": "my grandad's memoir" })).await;
    assert!(none["found"].as_array().unwrap().is_empty() && none["note"].as_str().unwrap().contains("ask"));
    let (p, _) = change(&ctx, "reading_add", json!({ "title": "Grandad's memoir" })).await;
    assert_eq!((p.title.as_str(), item(&p, "Details").after.as_deref()), ("Add your own book", Some("Added by you: not found on Open Library")));
}

#[tokio::test]
async fn cards_are_added_and_moved_by_column_name() {
    let db = db().await;
    let ctx = ctx(&db);
    let project = crate::features::project_board::service::create_project(&db, "Website").await.unwrap();
    let (p, card) = change(&ctx, "board_add_card", json!({ "project_id": project.id, "title": "Fix footer", "priority": 3 })).await;
    assert_eq!(item(&p, "Priority").after.as_deref(), Some("High"));
    let board = look(&ctx, "board_view", json!({ "project_id": project.id })).await;
    let last = board["columns"].as_array().unwrap().last().unwrap()["name"].as_str().unwrap().to_owned();
    let (p, _) = change(&ctx, "board_move_card", json!({ "id": card["card_id"], "column": last.to_lowercase() })).await;
    assert_eq!(p.items[0].after.as_deref(), Some(last.as_str()));
}

#[tokio::test]
async fn spending_is_added_in_the_accounts_currency() {
    let db = db().await;
    let ctx = ctx(&db);
    let account = crate::features::finance::types::AccountFields { name: "Current".into(), kind: "current".into(), currency: "GBP".into(), opening_balance: 10_000, color: "blue".into() };
    crate::features::finance::service::setup(&db, "GBP", account, ctx.today).await.unwrap();
    let (p, _) = change(&ctx, "finance_add", json!({ "amount": 12.5, "kind": "spending", "payee": "Pret" })).await;
    assert_eq!(item(&p, "Amount").after.as_deref(), Some("-£12.50"));
    let listed = look(&ctx, "finance_transactions", json!({})).await;
    assert_eq!(listed[0]["payee"], "Pret");
    let overview = look(&ctx, "finance_overview", json!({})).await;
    assert_eq!(overview["accounts"][0]["balance"], "£87.50");
}

#[tokio::test]
async fn gift_ideas_are_saved_bought_and_removed() {
    let db = db().await;
    let ctx = ctx(&db);
    let (_, ada) = change(&ctx, "birthdays_add", json!({ "name": "Ada", "month": 12, "day": 10 })).await;
    let (p, gift) = change(&ctx, "birthdays_add_gift", json!({ "person_id": ada["id"], "idea": "A fountain pen" })).await;
    assert_eq!((p.title.as_str(), item(&p, "Status").after.as_deref()), ("Save a gift idea for Ada", Some("Idea")));
    let (p, _) = change(&ctx, "birthdays_update_gift", json!({ "id": gift["id"], "status": "bought" })).await;
    assert_eq!(p.items, vec![Item::change("Status", "Idea", "Bought")]);
    let gifts = look(&ctx, "birthdays_gifts", json!({ "person_id": ada["id"] })).await;
    assert_eq!((gifts[0]["idea"].as_str(), gifts[0]["status"].as_str()), (Some("A fountain pen"), Some("bought")));
    change(&ctx, "birthdays_delete_gift", json!({ "id": gift["id"] })).await;
    assert_eq!(look(&ctx, "birthdays_gifts", json!({ "person_id": ada["id"] })).await, json!([]));
    assert!(preview(&ctx, &spec("birthdays_update_gift"), &json!({ "id": gift["id"], "status": "wrapped" })).await.is_err(), "only known statuses");
}

#[tokio::test]
async fn routines_repeat_on_their_days() {
    let db = db().await;
    let ctx = ctx(&db);
    let (p, r) = change(&ctx, "plan_add_routine", json!({ "title": "Gym", "start": "07:00", "minutes": 60, "days": ["mon", "wed", "fri"] })).await;
    assert_eq!(item(&p, "Days").after.as_deref(), Some("Mon, Wed, Fri"));
    assert_eq!(item(&p, "When").after.as_deref(), Some("07:00–08:00"));
    let (p, _) = change(&ctx, "plan_update_routine", json!({ "id": r["id"], "days": ["mon", "tue", "wed", "thu", "fri"] })).await;
    assert_eq!(p.items, vec![Item::change("Days", "Mon, Wed, Fri", "Weekdays")]);
    assert_eq!(look(&ctx, "plan_routines", json!({})).await[0]["days"], json!(["mon", "tue", "wed", "thu", "fri"]));
    change(&ctx, "plan_delete_routine", json!({ "id": r["id"] })).await;
    assert_eq!(look(&ctx, "plan_routines", json!({})).await, json!([]));
    assert!(preview(&ctx, &spec("plan_add_routine"), &json!({ "title": "Run", "start": "07:00", "minutes": 30, "days": [] })).await.is_err(), "needs a day");
    // Where blocks go: nowhere yet, as no calendar is chosen.
    assert_eq!(look(&ctx, "plan_day", json!({})).await["blocks_publish_to"], json!(null));
}

#[tokio::test]
async fn budgets_and_recurring_bills() {
    let db = db().await;
    let ctx = ctx(&db);
    let account = crate::features::finance::types::AccountFields { name: "Current".into(), kind: "current".into(), currency: "GBP".into(), opening_balance: 0, color: "blue".into() };
    crate::features::finance::service::setup(&db, "GBP", account, ctx.today).await.unwrap();
    let (p, _) = change(&ctx, "finance_set_budget", json!({ "category": "groceries", "amount": 250 })).await;
    assert_eq!(p.items, vec![Item::change("Monthly budget", "None", "£250.00 a month")]);
    let (p, bill) = change(&ctx, "finance_add_bill", json!({ "name": "Netflix", "amount": 10.99, "kind": "spending", "every": "month", "starts_on": "2026-11-03", "category": "Subscriptions" })).await;
    assert_eq!((item(&p, "Amount").after.as_deref(), item(&p, "Repeats").after.as_deref()), (Some("-£10.99"), Some("Every month")));
    assert_eq!(bill["next_due"], "2026-11-03");
    let (p, _) = change(&ctx, "finance_update_bill", json!({ "id": bill["id"], "amount": 12.99 })).await;
    assert_eq!(p.items, vec![Item::change("Amount", "-£10.99", "-£12.99")]);
    assert_eq!(look(&ctx, "finance_bills", json!({})).await[0]["amount"], "-£12.99");
    change(&ctx, "finance_delete_bill", json!({ "id": bill["id"] })).await;
    assert_eq!(look(&ctx, "finance_bills", json!({})).await, json!([]));
    assert!(preview(&ctx, &spec("finance_set_budget"), &json!({ "category": "Salary", "amount": 100 })).await.is_err(), "no budgets on income");
}

#[tokio::test]
async fn modules_lectures_and_timetables_are_added() {
    let db = db().await;
    let ctx = ctx(&db);
    let fields = crate::features::uni::types::TermFields { name: "Autumn".into(), starts_on: NaiveDate::from_ymd_opt(2026, 9, 28).unwrap(), weeks: 11 };
    crate::features::uni::service::add_term(&db, fields, ctx.today).await.unwrap();
    let (p, m) = change(&ctx, "uni_add_module", json!({ "code": "EC5001", "name": "Econometrics" })).await;
    assert_eq!(item(&p, "Term").after.as_deref(), Some("Autumn"));
    let (p, _) = change(&ctx, "uni_add_timetable", json!({ "module_id": m["module_id"], "kind": "lecture", "days": ["mon", "thu"], "from_week": 1, "to_week": 11, "skip_weeks": [6] })).await;
    assert_eq!(p.title, "Add 20 sessions to EC5001 Econometrics");
    let (p, _) = change(&ctx, "uni_add_lectures", json!({ "module_id": m["module_id"], "lectures": [{ "title": "Revision session", "kind": "seminar", "week": 11 }] })).await;
    assert_eq!(p.items, vec![Item::new("Seminar", "Revision session · Week 11")]);
    let module = look(&ctx, "uni_module", json!({ "id": m["module_id"] })).await;
    assert_eq!(module["lectures"].as_array().unwrap().len(), 21);
    assert!(preview(&ctx, &spec("uni_add_timetable"), &json!({ "module_id": m["module_id"], "kind": "lecture", "days": ["mon"], "from_week": 1, "to_week": 12 })).await.is_err(), "week 12 isn't in term");
}

#[tokio::test]
async fn skills_sources_and_units_are_added() {
    let db = db().await;
    let ctx = ctx(&db);
    let (_, skill) = change(&ctx, "learning_add_skill", json!({ "name": "Spanish", "icon": "🇪🇸" })).await;
    let (p, source) = change(&ctx, "learning_add_source", json!({ "skill_id": skill["skill_id"], "kind": "course", "title": "Duolingo", "units": ["Basics 1", "Basics 2", "Phrases"] })).await;
    assert_eq!(item(&p, "3 units").after.as_deref(), Some("Basics 1, Basics 2, Phrases"));
    let (p, _) = change(&ctx, "learning_add_units", json!({ "source_id": source["source_id"], "units": ["Food", "Travel"] })).await;
    assert_eq!(p.title, "Add 2 units to \"Duolingo\"");
    let detail = look(&ctx, "learning_source", json!({ "id": source["source_id"] })).await;
    let titles: Vec<&str> = detail["units"].as_array().unwrap().iter().map(|u| u["title"].as_str().unwrap()).collect();
    assert_eq!(titles, ["Basics 1", "Basics 2", "Phrases", "Food", "Travel"]);
}

#[tokio::test]
async fn cards_get_labels_and_checklists() {
    let db = db().await;
    let ctx = ctx(&db);
    let project = crate::features::project_board::service::create_project(&db, "Website").await.unwrap();
    let (_, card) = change(&ctx, "board_add_card", json!({ "project_id": project.id, "title": "Fix footer" })).await;
    change(&ctx, "board_add_label", json!({ "project_id": project.id, "name": "Bug", "color": "red" })).await;
    let (p, _) = change(&ctx, "board_set_labels", json!({ "id": card["card_id"], "labels": ["bug"] })).await;
    assert_eq!(p.items, vec![Item::new("Labels", "Bug")]);
    let (p, _) = change(&ctx, "board_add_checklist", json!({ "id": card["card_id"], "items": ["Check mobile", "Check dark mode"] })).await;
    assert_eq!(p.items.len(), 2);
    let full = look(&ctx, "board_card", json!({ "id": card["card_id"] })).await;
    assert_eq!(full["labels"], json!(["Bug"]));
    let first = full["checklist"][0]["id"].clone();
    let (p, _) = change(&ctx, "board_update_checklist", json!({ "item_id": first, "done": true })).await;
    assert_eq!(p.items, vec![Item::change("Status", "To do", "Done")]);
    change(&ctx, "board_delete_checklist", json!({ "item_id": full["checklist"][1]["id"] })).await;
    let full = look(&ctx, "board_card", json!({ "id": card["card_id"] })).await;
    assert_eq!(full["checklist"], json!([{ "id": first, "text": "Check mobile", "done": true }]));
    assert!(preview(&ctx, &spec("board_set_labels"), &json!({ "id": card["card_id"], "labels": ["Feature"] })).await.is_err(), "only the board's labels");
}

/// What Lemma writes is a real Yjs update on the editor's fragment, so it
/// merges with typing, and added to, never replacing, what's there.
#[tokio::test]
async fn journal_and_notes_are_written_as_the_editor_writes() {
    use yrs::updates::decoder::Decode;
    use yrs::{GetString, Transact};
    fn document(edits: &[crate::features::doc_edits::EditView]) -> String {
        use base64::Engine;
        let doc = yrs::Doc::new();
        let fragment = doc.get_or_insert_xml_fragment("default");
        let mut txn = doc.transact_mut();
        for e in edits {
            let bytes = base64::engine::general_purpose::STANDARD.decode(&e.data).unwrap();
            txn.apply_update(yrs::Update::decode_v1(&bytes).unwrap()).unwrap();
        }
        fragment.get_string(&txn)
    }
    let db = db().await;
    let ctx = ctx(&db);
    let (p, entry) = change(&ctx, "journal_write", json!({ "title": "A good day", "text": "Went for a run.\n\nFinished the essay.", "mood": 4 })).await;
    assert_eq!((item(&p, "Mood").after.as_deref(), item(&p, "Text").after.as_deref()), (Some("4 of 5"), Some("Went for a run.\nFinished the essay.")));
    change(&ctx, "journal_add_to", json!({ "id": entry["entry_id"], "text": "Early night." })).await;
    let saved = crate::features::journal::service::get(&db, entry["entry_id"].as_str().unwrap()).await.unwrap();
    assert_eq!(document(&saved.edits), "<paragraph>Went for a run.</paragraph><paragraph>Finished the essay.</paragraph><paragraph>Early night.</paragraph>");
    assert_eq!((saved.entry.text.as_str(), saved.entry.words, saved.entry.title.as_str(), saved.entry.mood), ("Went for a run.\nFinished the essay.\nEarly night.", 9, "A good day", Some(4)));

    let (_, note) = change(&ctx, "notes_write", json!({ "title": "Gift ideas", "text": "Pen\nScarf", "tags": ["gifts"] })).await;
    let saved = crate::features::notes::service::get(&db, note["note_id"].as_str().unwrap()).await.unwrap();
    assert_eq!((document(&saved.edits).as_str(), saved.tags.as_slice()), ("<paragraph>Pen</paragraph><paragraph>Scarf</paragraph>", ["gifts".to_owned()].as_slice()));
    assert!(preview(&ctx, &spec("notes_add_to"), &json!({ "id": note["note_id"], "text": "  \n " })).await.is_err(), "nothing to write");
}

/// For checking against the editor's own Yjs: adds a paragraph to the update
/// in `YJS_UPDATE` (base64) and prints what to save beside it.
#[test]
#[ignore = "used by tests/lemma-writing.mjs"]
fn print_an_append() {
    let given = std::env::var("YJS_UPDATE").unwrap_or_default();
    let edits = if given.is_empty() { vec![] } else { vec![crate::features::doc_edits::EditView { ids: vec!["typed".into()], data: given }] };
    println!("APPEND={}", crate::features::doc_edits::append(&edits, &["Added by Lemma.", "And a second line."]));
}

/// Undo puts every row a change touched back as it was, whatever the tool,
/// and refuses when something has changed it since.
#[tokio::test]
async fn confirmed_changes_can_be_undone() {
    use super::super::undo;
    let db = db().await;
    let ctx = ctx(&db);
    // Changing: a birthday's date goes back.
    let (_, ada) = change(&ctx, "birthdays_add", json!({ "name": "Ada", "month": 12, "day": 10 })).await;
    let before = undo::snapshot(&db, "birthdays").await.unwrap();
    apply(&ctx, "birthdays", "birthdays_update", &json!({ "id": ada["id"], "day": 11 })).await.unwrap();
    assert!(undo::keep(&db, "p1", before, undo::snapshot(&db, "birthdays").await.unwrap()).await.unwrap());
    assert_eq!(undo::undoable(&db, &["p1".into(), "p2".into()]).await.unwrap(), ["p1"]);
    undo::undo(&db, "p1").await.unwrap();
    assert_eq!(look(&ctx, "birthdays_list", json!({})).await[0]["day"], 10);
    assert!(undo::undo(&db, "p1").await.is_err(), "only once");

    // Adding: a whole plan of tasks and blocks goes away.
    let before = undo::snapshot(&db, "daily_plan").await.unwrap();
    apply(&ctx, "daily_plan", "plan_add", &json!({ "items": [{ "title": "Essay", "start": "09:00", "minutes": 90 }, { "title": "Lunch", "start": "12:00", "time_only": true }] })).await.unwrap();
    assert!(undo::keep(&db, "p2", before, undo::snapshot(&db, "daily_plan").await.unwrap()).await.unwrap());
    undo::undo(&db, "p2").await.unwrap();
    let day = look(&ctx, "plan_day", json!({})).await;
    assert_eq!((day["tasks"].as_array().unwrap().len(), day["blocks"].as_array().unwrap().len()), (0, 0));

    // Removing: a deleted gift comes back.
    let (_, gift) = change(&ctx, "birthdays_add_gift", json!({ "person_id": ada["id"], "idea": "Pen" })).await;
    let before = undo::snapshot(&db, "birthdays").await.unwrap();
    apply(&ctx, "birthdays", "birthdays_delete_gift", &json!({ "id": gift["id"] })).await.unwrap();
    assert!(undo::keep(&db, "p3", before, undo::snapshot(&db, "birthdays").await.unwrap()).await.unwrap());
    undo::undo(&db, "p3").await.unwrap();
    assert_eq!(look(&ctx, "birthdays_gifts", json!({ "person_id": ada["id"] })).await[0]["idea"], "Pen");

    // Changed again since: left alone, and still offered.
    let before = undo::snapshot(&db, "birthdays").await.unwrap();
    apply(&ctx, "birthdays", "birthdays_update", &json!({ "id": ada["id"], "notes": "Likes ink" })).await.unwrap();
    assert!(undo::keep(&db, "p4", before, undo::snapshot(&db, "birthdays").await.unwrap()).await.unwrap());
    apply(&ctx, "birthdays", "birthdays_update", &json!({ "id": ada["id"], "notes": "Likes blue ink" })).await.unwrap();
    assert!(undo::undo(&db, "p4").await.is_err());
    assert_eq!(look(&ctx, "birthdays_list", json!({})).await[0]["notes"], "Likes blue ink");

    // A change that changed nothing has nothing to undo.
    let before = undo::snapshot(&db, "goals").await.unwrap();
    assert!(!undo::keep(&db, "p5", before, undo::snapshot(&db, "goals").await.unwrap()).await.unwrap());
}

/// Gemini refuses a whole request over one schema it doesn't accept, so every
/// tool's, as sent, must only use what it takes.
#[test]
fn every_tool_is_one_gemini_accepts() {
    use axiom_protocol::ai::{ChatRequest, Tool};
    fn check(schema: &serde_json::Value, at: &str) {
        let Some(fields) = schema.as_object() else { return };
        for (key, value) in fields {
            let allowed = ["type", "description", "properties", "items", "enum", "required", "minimum", "maximum", "minItems", "maxItems", "nullable"];
            assert!(allowed.contains(&key.as_str()), "{at}: Gemini doesn't take {key}");
            if key == "enum" {
                assert!(value.as_array().unwrap().iter().all(serde_json::Value::is_string), "{at}: enums are text");
            }
            if key == "properties" {
                value.as_object().unwrap().iter().for_each(|(name, s)| check(s, &format!("{at}.{name}")));
            }
            if key == "items" {
                check(value, &format!("{at}[]"));
            }
        }
    }
    let all = specs(&AREAS.iter().map(|(id, _)| id.to_string()).collect::<Vec<_>>());
    let tools = all.iter().map(|s| Tool { name: s.name.into(), description: s.description.into(), parameters: s.parameters.clone() }).collect();
    let request = ChatRequest { system: String::new(), messages: vec![], tools };
    // The body Gemini gets, through the same translation the real calls use.
    let sent = axiom_ai::gemini_body(&request);
    for declaration in sent["tools"][0]["functionDeclarations"].as_array().unwrap() {
        check(&declaration["parameters"], declaration["name"].as_str().unwrap());
    }
}

#[test]
#[ignore = "prints sizes; run with --ignored --nocapture"]
fn tool_sizes() {
    for (area, _) in AREAS {
        let tools = specs(&[area.to_string()]);
        let bytes: usize = tools.iter().map(|s| s.name.len() + s.description.len() + s.parameters.to_string().len()).sum();
        println!("{area:14} {:2} tools  ~{:5} tokens", tools.len(), bytes / 4);
    }
    let all = specs(&AREAS.iter().map(|(id, _)| id.to_string()).collect::<Vec<_>>());
    let bytes: usize = all.iter().map(|s| s.name.len() + s.description.len() + s.parameters.to_string().len()).sum();
    println!("all            {:2} tools  ~{:5} tokens", all.len(), bytes / 4);
}
