//! Tests for Finance against a throwaway in-memory database, and the
//! exchange rate service against a stand-in server.

use base64::Engine;
use chrono::NaiveDate;
use sea_orm::{ConnectOptions, Database, DatabaseConnection, EntityTrait};
use serde_json::json;
use wiremock::matchers::{method, query_param};
use wiremock::{Mock, MockServer, ResponseTemplate};

use super::entities::{account, category};
use super::import::{self, CommitRow};
use super::rates::{self, Rates};
use super::service::*;
use super::types::{AccountFields, CategoryFields, RecurringFields, TransactionFields, TransactionFilter};

async fn setup_db() -> DatabaseConnection {
    let mut options = ConnectOptions::new("sqlite::memory:");
    options.max_connections(1).sqlx_logging(false);
    let db = Database::connect(options).await.unwrap();
    crate::db::prepare(&db).await.unwrap();
    db
}

fn day(m: u32, d: u32) -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, m, d).unwrap()
}

fn today() -> NaiveDate {
    day(10, 27)
}

fn account_fields(name: &str, kind: &str, currency: &str, opening: i64) -> AccountFields {
    AccountFields { name: name.into(), kind: kind.into(), currency: currency.into(), opening_balance: opening, color: "blue".into() }
}

/// Set up in pounds, with a current account holding £1,000.
async fn ready() -> (DatabaseConnection, String) {
    let db = setup_db().await;
    let state = setup(&db, "GBP", account_fields("Current", "current", "GBP", 100_000), today()).await.unwrap();
    let id = state.accounts[0].account.id.clone();
    (db, id)
}

fn tx(account: &str, d: NaiveDate, amount: i64, payee: &str, category: Option<&str>) -> TransactionFields {
    TransactionFields {
        account_id: account.into(),
        day: d,
        amount,
        payee: payee.into(),
        category_id: category.map(String::from),
        notes: String::new(),
        transfer_account_id: None,
        transfer_amount: None,
    }
}

#[tokio::test]
async fn setting_up_makes_the_starting_categories_once() {
    let db = setup_db().await;
    let state = setup(&db, "GBP", account_fields("Current", "current", "GBP", 0), today()).await.unwrap();
    assert_eq!(state.settings.unwrap().home_currency, "GBP");
    let count = state.categories.len();
    assert!(count > 10 && state.categories.iter().any(|c| c.id == "cat-salary" && c.kind == "income"));
    // Another computer (or a second go) doesn't make a second set.
    let again = setup(&db, "GBP", account_fields("", "current", "GBP", 0), today()).await.unwrap();
    assert_eq!(again.categories.len(), count);
    assert!(setup(&db, "pounds", account_fields("", "current", "GBP", 0), today()).await.is_err());
}

#[tokio::test]
async fn balances_and_transfers() {
    let (db, current) = ready().await;
    let savings = add_account(&db, account_fields("Savings", "savings", "GBP", 0)).await.unwrap().id;
    add_transaction(&db, tx(&current, day(10, 20), -1250, "Tesco", Some("cat-groceries"))).await.unwrap();
    let mut transfer = tx(&current, day(10, 21), 20_000, "", None);
    transfer.transfer_account_id = Some(savings.clone());
    let pair = add_transaction(&db, transfer).await.unwrap();
    assert_eq!((pair[0].amount, pair[1].amount), (-20_000, 20_000));
    assert_eq!((pair[0].payee.as_str(), pair[1].payee.as_str()), ("To Savings", "From Current"));

    let balances: Vec<i64> = cards(&db, today()).await.unwrap().iter().map(|c| c.balance).collect();
    assert_eq!(balances, [100_000 - 1250 - 20_000, 20_000]);
    // A transfer isn't spending.
    let month = month_summary(&db, "2026-10", today()).await.unwrap();
    assert_eq!((month.spending, month.income), (1250, 0));
    assert_eq!(month.net_worth, Some(100_000 - 1250));

    // Deleting one half deletes the other.
    delete_transaction(&db, &pair[1].id).await.unwrap();
    assert_eq!(cards(&db, today()).await.unwrap()[1].balance, 0);
    assert_eq!(cards(&db, today()).await.unwrap()[0].balance, 100_000 - 1250);
}

#[tokio::test]
async fn categories_are_learned_from_payees() {
    let (db, current) = ready().await;
    assert_eq!(payee_key("CARD PAYMENT TO TESCO STORES 4521 ON 23 OCT"), Some("tesco stores".into()));
    let t = add_transaction(&db, tx(&current, day(10, 20), -1250, "TESCO STORES 4521", None)).await.unwrap().remove(0);
    set_category(&db, &t.id, Some("cat-groceries".into())).await.unwrap();
    assert_eq!(suggest(&db, "Tesco Stores 0098").await.unwrap().as_deref(), Some("cat-groceries"));
    assert_eq!(suggest(&db, "Pret A Manger").await.unwrap(), None);
}

#[tokio::test]
async fn quick_entries_read_like_you_would_say_them() {
    let (db, current) = ready().await;
    let accounts = account::Entity::find().all(&db).await.unwrap();
    let categories = category::Entity::find().all(&db).await.unwrap();
    let read = |text: &str| super::quick::read(text, today(), "GBP", &accounts, &categories, None, false);

    let e = read("12.50 coffee yesterday");
    assert_eq!((e.amount, e.day, e.payee.as_str(), e.currency.as_str()), (Some(-1250), day(10, 26), "coffee", "GBP"));
    let e = read("+2400 salary");
    assert_eq!((e.amount, e.category_id.as_deref()), (Some(240_000), Some("cat-salary")));
    let e = read("2400 salary");
    assert_eq!(e.amount, Some(240_000), "an income category makes it income");
    let e = read("€30 dinner at Luigi's 3 days ago");
    assert_eq!((e.amount, e.currency.as_str(), e.day, e.payee.as_str()), (Some(-3000), "EUR", day(10, 24), "dinner at Luigi's"));
    let e = read("45 EUR train friday #transport @cur");
    assert_eq!((e.amount, e.currency.as_str(), e.day, e.category_id.as_deref(), e.account_id.as_deref()), (Some(-4500), "EUR", day(10, 23), Some("cat-transport"), Some(current.as_str())), "a currency typed wins");
    let e = read("9.99 netflix 12 oct #subs");
    assert_eq!((e.day, e.category_id.as_deref()), (day(10, 12), Some("cat-subscriptions")));
    let e = read("groceries 30");
    assert_eq!((e.amount, e.category_id.as_deref()), (Some(-3000), Some("cat-groceries")));
    assert_eq!(read("lunch").amount, None);
}

#[tokio::test]
async fn recurring_items_come_round_to_confirm_or_skip() {
    let (db, current) = ready().await;
    let rent = add_recurring(&db, RecurringFields { name: "Rent".into(), amount: -95_000, account_id: current.clone(), category_id: Some("cat-housing".into()), every: "month".into(), starts_on: day(8, 31), ends_on: None })
        .await
        .unwrap();
    // The 31st falls on the last day of shorter months.
    let days: Vec<NaiveDate> = occurrences(&rent, day(8, 1), day(12, 31));
    assert_eq!(days, [day(8, 31), day(9, 30), day(10, 31), day(11, 30), day(12, 31)]);

    let waiting: Vec<NaiveDate> = due(&db, day(10, 29)).await.unwrap().iter().map(|d| d.day).collect();
    assert_eq!(waiting, [day(8, 31), day(9, 30), day(10, 31)], "overdue ones, and one coming up");
    confirm(&db, &rent.id, day(9, 30), Some(-96_000)).await.unwrap();
    skip(&db, &rent.id, day(8, 31)).await.unwrap();
    let waiting: Vec<NaiveDate> = due(&db, day(10, 29)).await.unwrap().iter().map(|d| d.day).collect();
    assert_eq!(waiting, [day(10, 31)]);
    assert_eq!(cards(&db, today()).await.unwrap()[0].balance, 100_000 - 96_000);
}

#[tokio::test]
async fn a_month_by_category_with_budgets_and_refunds() {
    let (db, current) = ready().await;
    let groceries = update_category(&db, "cat-groceries", CategoryFields { name: "Groceries".into(), kind: "expense".into(), color: "green".into(), icon: "🛒".into(), budget: Some(30_000) })
        .await
        .unwrap();
    add_transaction(&db, tx(&current, day(10, 3), -12_000, "Tesco", Some(&groceries.id))).await.unwrap();
    add_transaction(&db, tx(&current, day(10, 9), 2_000, "Tesco refund", Some(&groceries.id))).await.unwrap();
    add_transaction(&db, tx(&current, day(10, 25), 240_000, "ACME", Some("cat-salary"))).await.unwrap();
    add_transaction(&db, tx(&current, day(10, 26), -500, "Mystery", None)).await.unwrap();
    add_transaction(&db, tx(&current, day(9, 26), -7_000, "Tesco", Some(&groceries.id))).await.unwrap();

    let m = month_summary(&db, "2026-10", today()).await.unwrap();
    assert_eq!((m.income, m.spending, m.uncategorised), (240_000, 12_000 - 2_000 + 500, 1));
    let g = m.spending_by_category.iter().find(|c| c.category_id.as_deref() == Some("cat-groceries")).unwrap();
    assert_eq!((g.total, g.budget, g.count), (10_000, Some(30_000), 2), "the refund comes off groceries");
    assert_eq!(m.budgeted, Some(30_000));
    let september = m.trend.iter().find(|t| t.month == "2026-09").unwrap();
    assert_eq!(september.spending, 7_000);
    assert_eq!(m.trend.len(), 12);
}

fn b64(text: &str) -> Vec<u8> {
    // The commands take base64; the importer takes bytes.
    base64::engine::general_purpose::STANDARD.decode(base64::engine::general_purpose::STANDARD.encode(text)).unwrap()
}

#[tokio::test]
async fn importing_a_statement_twice_adds_nothing_the_second_time() {
    let (db, current) = ready().await;
    // Entered by hand already: the statement's version is linked, not added.
    let hand = add_transaction(&db, tx(&current, day(10, 22), -345, "Coffee", Some("cat-eating-out"))).await.unwrap().remove(0);
    let csv = "Date,Description,Amount\n23/10/2026,PRET A MANGER,-3.45\n24/10/2026,TESCO STORES 4521,-12.50\n24/10/2026,TESCO STORES 4521,-12.50\n";
    let preview = import::preview(&db, &current, "statement.csv", &b64(csv), None).await.unwrap();
    assert_eq!(preview.format, "csv");
    assert_eq!(preview.rows.len(), 3);
    let pret = preview.rows.iter().find(|r| r.payee == "PRET A MANGER").unwrap();
    assert_eq!((pret.duplicate.as_deref(), pret.matches.as_deref()), (Some("entered"), Some(hand.id.as_str())));
    let tescos: Vec<_> = preview.rows.iter().filter(|r| r.payee.starts_with("TESCO")).collect();
    assert_ne!(tescos[0].import_ref, tescos[1].import_ref, "two identical rows are two transactions");

    let rows: Vec<CommitRow> = preview
        .rows
        .iter()
        .map(|r| CommitRow { import_ref: r.import_ref.clone(), day: r.day, amount: r.amount, payee: r.payee.clone(), notes: r.notes.clone(), category_id: r.category_id.clone(), matches: r.matches.clone() })
        .collect();
    assert_eq!(import::commit(&db, &current, rows, None).await.unwrap(), (2, 1));
    assert_eq!(list_transactions(&db, TransactionFilter::default()).await.unwrap().len(), 3);

    let again = import::preview(&db, &current, "statement.csv", &b64(csv), None).await.unwrap();
    assert!(again.rows.iter().all(|r| r.duplicate.as_deref() == Some("imported")), "{:?}", again.rows);
    // A PDF is turned away with advice.
    let err = import::preview(&db, &current, "statement.pdf", b"%PDF-1.7", None).await.unwrap_err();
    assert!(err.to_string().contains("CSV, OFX or QIF"));
}

#[tokio::test]
async fn other_currencies_convert_at_the_days_rate() {
    let (db, _) = ready().await;
    let euros = add_account(&db, account_fields("Euro card", "credit", "EUR", 0)).await.unwrap().id;
    let t = add_transaction(&db, tx(&euros, day(10, 20), -10_000, "Hotel", Some("cat-travel"))).await.unwrap().remove(0);
    assert_eq!(t.home_amount, None, "no rate yet");
    assert_eq!(month_summary(&db, "2026-10", today()).await.unwrap().unconverted, 1);

    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(query_param("base", "EUR"))
        .and(query_param("quotes", "GBP"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!([
            { "date": "2026-10-20", "base": "EUR", "quote": "GBP", "rate": 0.85 },
            { "date": "2026-10-27", "base": "EUR", "quote": "GBP", "rate": 0.86 }
        ])))
        .mount(&server)
        .await;
    let service = Rates::new(Some(&server.uri()));
    assert_eq!(rates::fill(&db, &service, today()).await.unwrap(), 1);
    let m = month_summary(&db, "2026-10", today()).await.unwrap();
    assert_eq!((m.spending, m.unconverted), (8_500, 0), "€100 at 0.85");
    // Balances use the latest rate.
    let card = cards(&db, today()).await.unwrap().into_iter().find(|c| c.account.id == euros).unwrap();
    assert_eq!(card.balance_home, Some(-8_600));

    // A new home currency: worked out again.
    set_home_currency(&db, "EUR").await.unwrap();
    let m = month_summary(&db, "2026-10", today()).await.unwrap();
    assert_eq!(m.spending, 10_000);
}
