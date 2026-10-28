//! Finance: see accounts, the month's spending and transactions; add a
//! transaction, or put one in a category; set a category's monthly budget;
//! and keep recurring bills (and regular income).

use serde::Deserialize;
use serde_json::{Value, json};

use super::{Ctx, Item, Preview, Spec, args, date, day_name, lines, nothing, object, unknown};
use crate::error::{Error, Result};
use crate::features::finance::money;
use crate::features::finance::service::{self, EVERY};
use crate::features::finance::types::{CategoryFields, FinanceState, RecurringFields, TransactionFields, TransactionFilter};

/// Transactions listed at most, newest first.
const MAX_LISTED: usize = 100;

pub fn specs() -> Vec<Spec> {
    let bill = json!({
        "name": { "type": "string", "description": "e.g. Rent, Netflix, Salary." },
        "amount": { "type": "number", "exclusiveMinimum": 0 },
        "kind": { "type": "string", "enum": ["spending", "income"] },
        "every": { "type": "string", "enum": EVERY },
        "starts_on": { "type": "string", "description": "YYYY-MM-DD it first comes round; today if left out." },
        "ends_on": { "type": "string", "description": "YYYY-MM-DD it stops, if it does." },
        "account_id": { "type": "string", "description": "Left out: the first account." },
        "category": { "type": "string", "description": "A category's name or id." },
    });
    let mut bill_changes = bill.clone();
    bill_changes["id"] = json!({ "type": "string" });
    vec![
        Spec {
            area: "finance",
            name: "finance_overview",
            description: "Accounts and their balances, and one month's income, spending by category (with budgets), bills due and net worth.",
            parameters: object(json!({ "month": { "type": "string", "description": "YYYY-MM; this month if left out." } }), &[]),
            change: false,
        },
        Spec {
            area: "finance",
            name: "finance_transactions",
            description: "Transactions, newest first, filtered by month, account, category (name, or \"none\" for uncategorised) or a search of payees and notes. Spending is negative.",
            parameters: object(
                json!({ "month": { "type": "string", "description": "YYYY-MM" }, "account_id": { "type": "string" }, "category": { "type": "string" }, "search": { "type": "string" }, "limit": { "type": "integer", "maximum": MAX_LISTED } }),
                &[],
            ),
            change: false,
        },
        Spec {
            area: "finance",
            name: "finance_add",
            description: "Proposes adding a transaction: money spent (or received) in an account. Amount is a positive number in the account's currency.",
            parameters: object(
                json!({
                    "amount": { "type": "number", "exclusiveMinimum": 0 },
                    "kind": { "type": "string", "enum": ["spending", "income"] },
                    "payee": { "type": "string", "description": "Who it was paid to or came from." },
                    "category": { "type": "string", "description": "A category's name or id." },
                    "account_id": { "type": "string", "description": "Left out: the first account." },
                    "day": { "type": "string", "description": "YYYY-MM-DD; today if left out." },
                    "notes": { "type": "string" },
                }),
                &["amount", "kind", "payee"],
            ),
            change: true,
        },
        Spec {
            area: "finance",
            name: "finance_categorise",
            description: "Proposes putting a transaction (by id) in a category (by name or id).",
            parameters: object(json!({ "id": { "type": "string" }, "category": { "type": "string" } }), &["id", "category"]),
            change: true,
        },
        Spec {
            area: "finance",
            name: "finance_set_budget",
            description: "Proposes a spending category's monthly budget (by name or id), a positive amount in the home currency; 0 clears it.",
            parameters: object(json!({ "category": { "type": "string" }, "amount": { "type": "number", "minimum": 0 } }), &["category", "amount"]),
            change: true,
        },
        Spec {
            area: "finance",
            name: "finance_bills",
            description: "Recurring bills and regular income (rent, subscriptions, salary), with ids: amount (spending is negative), how often, account, category, when it started and ends, and when it's next due.",
            parameters: nothing(),
            change: false,
        },
        Spec {
            area: "finance",
            name: "finance_add_bill",
            description: "Proposes a recurring bill (or regular income). Amount is a positive number in the account's currency. It first comes round on starts_on, then every week, month or year.",
            parameters: object(bill.clone(), &["name", "amount", "kind", "every"]),
            change: true,
        },
        Spec {
            area: "finance",
            name: "finance_update_bill",
            description: "Proposes changing a recurring bill by id (from finance_bills). Give only what changes; ends_on \"none\" clears the end.",
            parameters: object(bill_changes, &["id"]),
            change: true,
        },
        Spec {
            area: "finance",
            name: "finance_delete_bill",
            description: "Proposes stopping a recurring bill, by id. Transactions it already made stay.",
            parameters: object(json!({ "id": { "type": "string" } }), &["id"]),
            change: true,
        },
    ]
}

#[derive(Deserialize, Default)]
struct A {
    id: Option<String>,
    month: Option<String>,
    account_id: Option<String>,
    category: Option<String>,
    search: Option<String>,
    limit: Option<usize>,
    amount: Option<f64>,
    kind: Option<String>,
    payee: Option<String>,
    day: Option<String>,
    notes: Option<String>,
    name: Option<String>,
    every: Option<String>,
    starts_on: Option<String>,
    ends_on: Option<String>,
}

/// A positive amount the AI wrote, in a currency's minor units.
fn minor(amount: Option<f64>, currency: &str) -> Result<i64> {
    let amount = amount.filter(|v| v.is_finite() && *v > 0.0).ok_or_else(|| Error::Invalid("Give a positive amount.".into()))?;
    Ok((amount * 10f64.powi(money::exponent(currency) as i32)).round() as i64)
}

fn home_currency(state: &FinanceState) -> String {
    state.settings.as_ref().map_or_else(|| "GBP".into(), |s| s.home_currency.clone())
}

// ---------- Budgets ----------

/// The category, its fields with the new budget, and the budget before.
fn budget_change(a: &A, state: &FinanceState) -> Result<(String, CategoryFields, Option<i64>)> {
    let id = category_id(state, a.category.as_deref().unwrap_or_default())?;
    let c = state.categories.iter().find(|c| c.id == id).ok_or(Error::NotFound("Category"))?;
    if c.kind != "expense" {
        return Err(Error::Invalid(format!("{} is an income category; budgets are for spending.", c.name)));
    }
    let budget = match a.amount {
        Some(v) if v == 0.0 => None,
        v => Some(minor(v, &home_currency(state))?),
    };
    let fields = CategoryFields { name: c.name.clone(), kind: c.kind.clone(), color: c.color.clone(), icon: c.icon.clone(), budget };
    Ok((id, fields, c.budget))
}

fn budget_text(budget: Option<i64>, currency: &str) -> String {
    budget.map_or_else(|| "None".into(), |b| format!("{} a month", money::display(b, currency)))
}

// ---------- Bills ----------

type Bill = crate::features::finance::entities::recurring::Model;

fn find_bill<'a>(state: &'a FinanceState, id: &str) -> Result<&'a Bill> {
    state.recurring.iter().find(|r| r.id == id).ok_or(Error::NotFound("Recurring bill"))
}

fn account_name(state: &FinanceState, id: &str) -> String {
    state.accounts.iter().find(|a| a.account.id == id).map_or_else(|| "?".into(), |a| a.account.name.clone())
}

/// A bill's fields from what the AI sent, on top of the bill it changes (if
/// any), with the account's currency.
fn bill_fields(a: &A, state: &FinanceState, base: Option<&Bill>, today: sea_orm::prelude::Date) -> Result<(RecurringFields, String)> {
    let account = match a.account_id.as_deref().or(base.map(|b| b.account_id.as_str())) {
        Some(id) => state.accounts.iter().find(|c| c.account.id == id && !c.account.archived),
        None => state.accounts.iter().find(|c| !c.account.archived),
    }
    .ok_or_else(|| Error::Invalid("There's no such account. Use finance_overview to see them.".into()))?;
    let currency = account.account.currency.clone();
    let income = a.kind.as_deref().map_or(base.is_some_and(|b| b.amount > 0), |k| k == "income");
    let size = match (a.amount, base) {
        (None, Some(b)) => b.amount.abs(),
        (amount, _) => minor(amount, &currency)?,
    };
    let ends_on = match a.ends_on.as_deref().map(str::trim) {
        Some("none" | "") => None,
        Some(day) => Some(date(day)?),
        None => base.and_then(|b| b.ends_on),
    };
    let fields = RecurringFields {
        name: a.name.as_deref().map(str::trim).map_or_else(|| base.map(|b| b.name.clone()).unwrap_or_default(), str::to_owned),
        amount: if income { size } else { -size },
        account_id: account.account.id.clone(),
        category_id: match a.category.as_deref() {
            Some(c) => Some(category_id(state, c)?),
            None => base.and_then(|b| b.category_id.clone()),
        },
        every: a.every.clone().or(base.map(|b| b.every.clone())).ok_or_else(|| Error::Invalid(format!("Say how often: {}.", EVERY.join(", "))))?,
        starts_on: a.starts_on.as_deref().map(date).transpose()?.or(base.map(|b| b.starts_on)).unwrap_or(today),
        ends_on,
    };
    if !EVERY.contains(&fields.every.as_str()) {
        return Err(Error::Invalid(format!("Say how often: {}.", EVERY.join(", "))));
    }
    if fields.name.is_empty() {
        return Err(Error::Invalid("Give it a name, like Rent or Netflix.".into()));
    }
    if fields.ends_on.is_some_and(|end| end < fields.starts_on) {
        return Err(Error::Invalid("It can't end before it starts.".into()));
    }
    Ok((fields, currency))
}

fn bill_items(f: &RecurringFields, currency: &str, state: &FinanceState, today: sea_orm::prelude::Date) -> Vec<(&'static str, String)> {
    vec![
        ("Name", f.name.clone()),
        ("Amount", money::display(f.amount, currency)),
        ("Repeats", format!("Every {}", f.every)),
        ("Account", account_name(state, &f.account_id)),
        ("Category", category_name(state, f.category_id.as_deref())),
        ("Starts", day_name(f.starts_on, today)),
        ("Ends", f.ends_on.map(|d| day_name(d, today)).unwrap_or_default()),
    ]
}

fn fields_of_bill(b: &Bill) -> RecurringFields {
    RecurringFields { name: b.name.clone(), amount: b.amount, account_id: b.account_id.clone(), category_id: b.category_id.clone(), every: b.every.clone(), starts_on: b.starts_on, ends_on: b.ends_on }
}

fn brief_bill(b: &Bill, state: &FinanceState, today: sea_orm::prelude::Date) -> Value {
    let currency = state.accounts.iter().find(|a| a.account.id == b.account_id).map_or_else(|| home_currency(state), |a| a.account.currency.clone());
    let next = service::occurrences(b, today, today + chrono::Days::new(400)).first().copied();
    json!({
        "id": b.id, "name": b.name, "amount": money::display(b.amount, &currency), "every": b.every, "account": account_name(state, &b.account_id),
        "category": category_name(state, b.category_id.as_deref()), "starts_on": b.starts_on, "ends_on": b.ends_on, "next_due": next,
    })
}

fn category_name(state: &FinanceState, id: Option<&str>) -> String {
    id.and_then(|id| state.categories.iter().find(|c| c.id == id)).map_or_else(|| "Uncategorised".into(), |c| c.name.clone())
}

/// A category by name or id.
fn category_id(state: &FinanceState, wanted: &str) -> Result<String> {
    let wanted = wanted.trim();
    state
        .categories
        .iter()
        .filter(|c| !c.archived)
        .find(|c| c.id == wanted || c.name.eq_ignore_ascii_case(wanted))
        .map(|c| c.id.clone())
        .ok_or_else(|| {
            let names: Vec<&str> = state.categories.iter().filter(|c| !c.archived).map(|c| c.name.as_str()).collect();
            Error::Invalid(format!("The categories are: {}.", names.join(", ")))
        })
}

pub async fn read(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    let a: A = args(raw)?;
    let state = service::state(ctx.db, ctx.today).await?;
    if state.settings.is_none() {
        return Ok(json!({ "note": "Finance isn't set up yet: there are no accounts." }));
    }
    match tool {
        "finance_overview" => {
            let month = a.month.unwrap_or_else(|| ctx.today.format("%Y-%m").to_string());
            let s = service::month_summary(ctx.db, &month, ctx.today).await?;
            let home = s.home_currency.clone();
            let spend = |list: &[crate::features::finance::types::CategorySpend]| {
                list.iter()
                    .map(|c| json!({ "category": category_name(&state, c.category_id.as_deref()), "total": money::display(c.total, &home), "budget": c.budget.map(|b| money::display(b, &home)), "transactions": c.count }))
                    .collect::<Vec<_>>()
            };
            Ok(json!({
                "accounts": state.accounts.iter().filter(|a| !a.account.archived).map(|a| json!({
                    "id": a.account.id, "name": a.account.name, "kind": a.account.kind, "balance": money::display(a.balance, &a.account.currency),
                })).collect::<Vec<_>>(),
                "month": month,
                "income": money::display(s.income, &home),
                "spending": money::display(s.spending, &home),
                "budgeted": s.budgeted.map(|b| money::display(b, &home)),
                "spending_by_category": spend(&s.spending_by_category),
                "income_by_category": spend(&s.income_by_category),
                "uncategorised_transactions": s.uncategorised,
                "bills_due": s.due.iter().map(|d| json!({ "name": d.name, "day": d.day, "amount": money::display(d.amount, &d.currency) })).collect::<Vec<_>>(),
                "net_worth": s.net_worth.map(|n| money::display(n, &home)),
            }))
        }
        "finance_transactions" => {
            let category_id = match a.category.as_deref() {
                Some("none") => Some("none".to_owned()),
                Some(name) => Some(category_id(&state, name)?),
                None => None,
            };
            let filter = TransactionFilter { month: a.month, account_id: a.account_id, category_id, search: a.search };
            let rows = service::list_transactions(ctx.db, filter).await?;
            let account = |id: &str| state.accounts.iter().find(|a| a.account.id == id).map(|a| a.account.name.clone());
            Ok(json!(rows
                .iter()
                .take(a.limit.unwrap_or(50).min(MAX_LISTED))
                .map(|r| json!({
                    "id": r.transaction.id, "day": r.transaction.day, "payee": r.transaction.payee, "amount": money::display(r.transaction.amount, &r.currency),
                    "category": category_name(&state, r.transaction.category_id.as_deref()), "account": account(&r.transaction.account_id), "notes": r.transaction.notes,
                }))
                .collect::<Vec<_>>()))
        }
        "finance_bills" => Ok(json!(state.recurring.iter().map(|b| brief_bill(b, &state, ctx.today)).collect::<Vec<_>>())),
        _ => Err(unknown(tool)),
    }
}

/// The transaction to add, checked, with its account's name and currency.
fn new_transaction(a: &A, state: &FinanceState, today: sea_orm::prelude::Date) -> Result<(TransactionFields, String, String)> {
    let account = match a.account_id.as_deref() {
        Some(id) => state.accounts.iter().find(|c| c.account.id == id && !c.account.archived),
        None => state.accounts.iter().find(|c| !c.account.archived),
    }
    .ok_or_else(|| Error::Invalid("There's no such account. Use finance_overview to see them.".into()))?;
    let currency = account.account.currency.clone();
    let size = minor(a.amount, &currency)?;
    let signed = if a.kind.as_deref() == Some("income") { size } else { -size };
    let fields = TransactionFields {
        account_id: account.account.id.clone(),
        day: a.day.as_deref().map(date).transpose()?.unwrap_or(today),
        amount: signed,
        payee: a.payee.clone().unwrap_or_default().trim().to_owned(),
        category_id: a.category.as_deref().map(|c| category_id(state, c)).transpose()?,
        notes: a.notes.clone().unwrap_or_default(),
        transfer_account_id: None,
        transfer_amount: None,
    };
    service::check_transaction(&fields)?;
    Ok((fields, account.account.name.clone(), currency))
}

pub async fn preview(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Preview> {
    let a: A = args(raw)?;
    let state = service::state(ctx.db, ctx.today).await?;
    match tool {
        "finance_add" => {
            let (f, account, currency) = new_transaction(&a, &state, ctx.today)?;
            let mut items = vec![
                Item::new("Amount", money::display(f.amount, &currency)),
                Item::new(if f.amount < 0 { "Paid to" } else { "From" }, &f.payee),
                Item::new("Category", category_name(&state, f.category_id.as_deref())),
                Item::new("Account", account),
                Item::new("Day", day_name(f.day, ctx.today)),
            ];
            if !f.notes.is_empty() {
                items.push(Item::new("Notes", &f.notes));
            }
            Ok(Preview { title: format!("Add {}", if f.amount < 0 { "spending" } else { "income" }), items })
        }
        "finance_categorise" => {
            let id = a.id.clone().unwrap_or_default();
            let all = service::list_transactions(ctx.db, TransactionFilter::default()).await?;
            let row = all.iter().find(|r| r.transaction.id == id).ok_or(Error::NotFound("Transaction"))?;
            let to = category_id(&state, a.category.as_deref().unwrap_or_default())?;
            Ok(Preview {
                title: format!("Categorise {} · {}", row.transaction.payee, money::display(row.transaction.amount, &row.currency)),
                items: vec![Item::change("Category", category_name(&state, row.transaction.category_id.as_deref()), category_name(&state, Some(&to)))],
            })
        }
        "finance_set_budget" => {
            let (_, fields, before) = budget_change(&a, &state)?;
            if fields.budget == before {
                return Err(Error::Invalid("That changes nothing.".into()));
            }
            let home = home_currency(&state);
            Ok(Preview { title: format!("Budget for {}", fields.name), items: vec![Item::change("Monthly budget", budget_text(before, &home), budget_text(fields.budget, &home))] })
        }
        "finance_add_bill" => {
            let (f, currency) = bill_fields(&a, &state, None, ctx.today)?;
            let title = format!("Add {} {}", if f.amount < 0 { "the bill" } else { "the regular income" }, f.name);
            Ok(Preview { title, items: lines(bill_items(&f, &currency, &state, ctx.today), None) })
        }
        "finance_update_bill" => {
            let current = find_bill(&state, a.id.as_deref().unwrap_or_default())?;
            let (after, currency) = bill_fields(&a, &state, Some(current), ctx.today)?;
            let items = lines(bill_items(&after, &currency, &state, ctx.today), Some(bill_items(&fields_of_bill(current), &currency, &state, ctx.today)));
            if items.is_empty() {
                return Err(Error::Invalid("That changes nothing.".into()));
            }
            Ok(Preview { title: format!("Change {}", current.name), items })
        }
        "finance_delete_bill" => {
            let current = find_bill(&state, a.id.as_deref().unwrap_or_default())?;
            let (f, currency) = (fields_of_bill(current), state.accounts.iter().find(|x| x.account.id == current.account_id).map_or_else(|| home_currency(&state), |x| x.account.currency.clone()));
            Ok(Preview { title: format!("Stop {}", current.name), items: vec![Item::gone("Repeats", format!("{} every {}", money::display(f.amount, &currency), f.every))] })
        }
        _ => Err(unknown(tool)),
    }
}

pub async fn apply(ctx: &Ctx<'_>, tool: &str, raw: &Value) -> Result<Value> {
    let a: A = args(raw)?;
    let state = service::state(ctx.db, ctx.today).await?;
    match tool {
        "finance_add" => {
            let (fields, _, _) = new_transaction(&a, &state, ctx.today)?;
            let saved = service::add_transaction(ctx.db, fields).await?;
            Ok(json!({ "transaction_id": saved.first().map(|t| t.id.clone()) }))
        }
        "finance_categorise" => {
            let to = category_id(&state, a.category.as_deref().unwrap_or_default())?;
            service::set_category(ctx.db, a.id.as_deref().unwrap_or_default(), Some(to)).await?;
            Ok(json!({ "categorised": true }))
        }
        "finance_set_budget" => {
            let (id, fields, _) = budget_change(&a, &state)?;
            let saved = service::update_category(ctx.db, &id, fields).await?;
            Ok(json!({ "category": saved.name, "budget": saved.budget.map(|b| money::display(b, &home_currency(&state))) }))
        }
        "finance_add_bill" => {
            let (fields, _) = bill_fields(&a, &state, None, ctx.today)?;
            let saved = service::add_recurring(ctx.db, fields).await?;
            Ok(brief_bill(&saved, &state, ctx.today))
        }
        "finance_update_bill" => {
            let id = a.id.clone().unwrap_or_default();
            let (fields, _) = bill_fields(&a, &state, Some(find_bill(&state, &id)?), ctx.today)?;
            let saved = service::update_recurring(ctx.db, &id, fields).await?;
            Ok(brief_bill(&saved, &state, ctx.today))
        }
        "finance_delete_bill" => {
            service::delete_recurring(ctx.db, a.id.as_deref().unwrap_or_default()).await?;
            Ok(json!({ "stopped": true }))
        }
        _ => Err(unknown(tool)),
    }
}
