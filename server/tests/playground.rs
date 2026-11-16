//! The Playground end to end: joining, friends by handle and by code, what
//! each person may see, believable numbers only, and leaving.

mod common;

use axiom_protocol::playground::{first_of_month, monday_of};
use axiom_protocol::{route, routes};
use axum::Router;
use axum::http::{Method, StatusCode};
use chrono::{Days, NaiveDate, Utc};
use common::*;
use serde_json::{Value, json};

async fn account(app: &Router, email: &str) -> String {
    let (status, body) = post(app, routes::SIGN_UP, credentials(email, "correct horse")).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["access_token"].as_str().unwrap().into()
}

async fn as_user(app: &Router, token: &str, method: Method, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    call(app, method, path, Some(token), body).await
}

fn today() -> NaiveDate {
    Utc::now().date_naive()
}

async fn join(app: &Router, token: &str, handle: &str, global: bool) -> Value {
    let body = json!({
        "handle": handle,
        "global": global,
        "shared": ["active", "reading.pages", "project_board.done"],
        "lemma": { "look": { "glow": "#ff5c8a", "shape": "prism", "holding": "glitch" }, "name": "Pixel", "personality": "witty" },
    });
    let (status, me) = as_user(app, token, Method::PUT, routes::PLAYGROUND_ME, Some(body)).await;
    assert_eq!(status, StatusCode::OK, "{me}");
    me
}

fn stats(metric: &str, week: i64, streak: u32) -> Value {
    let t = today();
    json!({
        "metric": metric,
        "weekKey": monday_of(t), "week": week, "lastWeek": 5,
        "monthKey": first_of_month(t), "month": week, "lastMonth": 9,
        "total": week + 100, "streak": streak, "bestStreak": streak.max(4),
        "streakThrough": if streak > 0 { Some(t) } else { None },
    })
}

async fn publish(app: &Router, token: &str, list: Vec<Value>) -> (StatusCode, Value) {
    as_user(app, token, Method::PUT, routes::PLAYGROUND_STATS, Some(json!({ "today": today(), "stats": list }))).await
}

async fn board(app: &Router, token: &str, metric: &str, period: &str, scope: &str) -> (StatusCode, Value) {
    let path = format!("{}?metric={metric}&period={period}&scope={scope}&today={}", routes::PLAYGROUND_BOARD, today());
    as_user(app, token, Method::GET, &path, None).await
}

fn handles(board: &Value) -> Vec<String> {
    board["entries"].as_array().unwrap().iter().map(|e| e["player"]["handle"].as_str().unwrap().to_owned()).collect()
}

#[tokio::test]
async fn joining_needs_a_free_valid_handle() {
    let app = server().await;
    let ada = account(&app, "ada@example.com").await;
    let (status, me) = as_user(&app, &ada, Method::GET, routes::PLAYGROUND_ME, None).await;
    assert_eq!((status, me), (StatusCode::OK, Value::Null), "not joined yet");

    let me = join(&app, &ada, "@Ada_L", false).await;
    assert_eq!(me["player"]["handle"], "ada_l");
    assert_eq!(me["player"]["lemma"]["name"], "Pixel");
    assert_eq!(me["friendCode"].as_str().unwrap().len(), 8);
    assert!(me["player"].get("email").is_none(), "never the email");

    let bob = account(&app, "bob@example.com").await;
    let body = |handle: &str| json!({ "handle": handle, "global": false, "shared": [], "lemma": { "look": {}, "name": "", "personality": "standard" } });
    let (status, _) = as_user(&app, &bob, Method::PUT, routes::PLAYGROUND_ME, Some(body("ADA_L"))).await;
    assert_eq!(status, StatusCode::CONFLICT, "taken, whatever the case");
    let (status, _) = as_user(&app, &bob, Method::PUT, routes::PLAYGROUND_ME, Some(body("admin"))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "reserved");

    // Handles are for good.
    let (status, me) = as_user(&app, &ada, Method::PUT, routes::PLAYGROUND_ME, Some(body("ada_new"))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{me}");
    assert!(me["message"].as_str().unwrap().contains("@ada_l"));

    let mut sneaky = body("bobby");
    sneaky["lemma"]["look"]["onerror"] = json!("alert(1)");
    let (status, _) = as_user(&app, &bob, Method::PUT, routes::PLAYGROUND_ME, Some(sneaky)).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "only look fields");
}

#[tokio::test]
async fn friends_by_handle_need_an_answer_but_codes_are_instant() {
    let app = server().await;
    let ada = account(&app, "ada@example.com").await;
    let bob = account(&app, "bob@example.com").await;
    let cy = account(&app, "cy@example.com").await;
    join(&app, &ada, "ada", false).await;
    join(&app, &bob, "bob", false).await;
    let cy_me = join(&app, &cy, "cyd", false).await;

    let (status, added) = as_user(&app, &ada, Method::POST, routes::PLAYGROUND_FRIENDS, Some(json!({ "handle": "@BOB" }))).await;
    assert_eq!((status, added["outcome"].as_str()), (StatusCode::OK, Some("requested")), "{added}");
    let (_, theirs) = as_user(&app, &bob, Method::GET, routes::PLAYGROUND_FRIENDS, None).await;
    assert_eq!(theirs["incoming"][0]["player"]["handle"], "ada");
    let (_, me) = as_user(&app, &bob, Method::GET, routes::PLAYGROUND_ME, None).await;
    assert_eq!(me["requests"], 1);

    // Ada can't accept her own request; Bob can.
    let ada_id = theirs["incoming"][0]["player"]["userId"].as_str().unwrap().to_owned();
    let bob_id = added["player"]["userId"].as_str().unwrap().to_owned();
    let (status, _) = as_user(&app, &ada, Method::POST, &route(routes::PLAYGROUND_FRIEND_ACCEPT, &[("user_id", &bob_id)]), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    let (status, _) = as_user(&app, &bob, Method::POST, &route(routes::PLAYGROUND_FRIEND_ACCEPT, &[("user_id", &ada_id)]), None).await;
    assert_eq!(status, StatusCode::NO_CONTENT);

    // A code makes friends at once, and a new code retires the old one.
    let code = cy_me["friendCode"].as_str().unwrap().to_lowercase();
    let (status, added) = as_user(&app, &ada, Method::POST, routes::PLAYGROUND_FRIENDS, Some(json!({ "code": code }))).await;
    assert_eq!((status, added["outcome"].as_str()), (StatusCode::OK, Some("friends")), "{added}");
    let (_, fresh) = as_user(&app, &cy, Method::POST, routes::PLAYGROUND_CODE, None).await;
    assert_ne!(fresh["friendCode"].as_str().unwrap().to_lowercase(), code);
    let (status, _) = as_user(&app, &bob, Method::POST, routes::PLAYGROUND_FRIENDS, Some(json!({ "code": code }))).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "the old code stopped working");

    let (_, list) = as_user(&app, &ada, Method::GET, routes::PLAYGROUND_FRIENDS, None).await;
    assert_eq!(list["friends"].as_array().unwrap().len(), 2);

    // Cheers: friends only, once a day.
    let cheer = route(routes::PLAYGROUND_FRIEND_CHEER, &[("user_id", &bob_id)]);
    assert_eq!(as_user(&app, &ada, Method::POST, &cheer, None).await.0, StatusCode::NO_CONTENT);
    assert_eq!(as_user(&app, &ada, Method::POST, &cheer, None).await.0, StatusCode::NO_CONTENT);
    let (_, me) = as_user(&app, &bob, Method::GET, routes::PLAYGROUND_ME, None).await;
    assert_eq!(me["cheersThisWeek"], 1);
    let cy_id = cy_me["player"]["userId"].as_str().unwrap();
    let (status, _) = as_user(&app, &bob, Method::POST, &route(routes::PLAYGROUND_FRIEND_CHEER, &[("user_id", cy_id)]), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "Bob and Cy aren't friends");

    // Unfriending.
    assert_eq!(as_user(&app, &bob, Method::DELETE, &route(routes::PLAYGROUND_FRIEND, &[("user_id", &ada_id)]), None).await.0, StatusCode::NO_CONTENT);
    let (_, list) = as_user(&app, &ada, Method::GET, routes::PLAYGROUND_FRIENDS, None).await;
    assert_eq!(list["friends"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn boards_show_friends_or_those_who_opted_in() {
    let app = server().await;
    let ada = account(&app, "ada@example.com").await;
    let bob = account(&app, "bob@example.com").await;
    let cy = account(&app, "cy@example.com").await;
    join(&app, &ada, "ada", true).await;
    let bob_me = join(&app, &bob, "bob", false).await;
    join(&app, &cy, "cyd", true).await;
    as_user(&app, &ada, Method::POST, routes::PLAYGROUND_FRIENDS, Some(json!({ "code": bob_me["friendCode"] }))).await;

    for (token, pages, streak) in [(&ada, 120, 3), (&bob, 300, 9), (&cy, 80, 0)] {
        let (status, body) = publish(&app, token, vec![stats("reading.pages", pages, streak), stats("project_board.done", 4, 1)]).await;
        assert_eq!((status, body["saved"].as_u64()), (StatusCode::OK, Some(2)), "{body}");
    }

    // Friends: Ada and Bob, best first, with Bob's Lemma.
    let (status, friends) = board(&app, &ada, "reading.pages", "week", "friends").await;
    assert_eq!(status, StatusCode::OK, "{friends}");
    assert_eq!(handles(&friends), ["bob", "ada"]);
    assert_eq!(friends["entries"][0]["player"]["lemma"]["look"]["shape"], "prism");
    assert_eq!(friends["entries"][0]["previous"], 5);

    // Global: Ada and Cy opted in; Bob didn't, so he isn't listed even though he's top.
    let (_, global) = board(&app, &ada, "reading.pages", "week", "global").await;
    assert_eq!(handles(&global), ["ada", "cyd"]);
    let (_, from_bob) = board(&app, &bob, "reading.pages", "week", "global").await;
    assert_eq!(from_bob["joined"], false);
    assert_eq!(from_bob["you"]["rank"], 1, "where Bob would be, for him alone");

    // Streaks: Cy has none, so isn't on the streak board.
    let (_, streaks) = board(&app, &ada, "reading.pages", "streak", "global").await;
    assert_eq!(handles(&streaks), ["ada"]);

    // Friends-only metrics never go global.
    let (status, _) = board(&app, &ada, "project_board.done", "week", "global").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn only_believable_shared_numbers_are_kept() {
    let app = server().await;
    let ada = account(&app, "ada@example.com").await;
    let (status, _) = publish(&app, &ada, vec![stats("reading.pages", 10, 1)]).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "not joined");
    join(&app, &ada, "ada", true).await;

    let (status, body) = publish(&app, &ada, vec![stats("active", 9, 2), stats("reading.pages", 40, 1), stats("journal.days", 3, 3)]).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body["saved"], 1, "journal isn't shared; active can't be 9 days in a week");
    assert_eq!(body["refused"], json!(["active"]));

    let old = today() - Days::new(10);
    let (status, _) = as_user(&app, &ada, Method::PUT, routes::PLAYGROUND_STATS, Some(json!({ "today": old, "stats": [] }))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "a date far from the server's");

    // Sharing less deletes the rest.
    let body = json!({ "handle": "ada", "global": true, "shared": ["active"], "lemma": { "look": {}, "name": "", "personality": "calm" } });
    as_user(&app, &ada, Method::PUT, routes::PLAYGROUND_ME, Some(body)).await;
    let (_, b) = board(&app, &ada, "reading.pages", "week", "friends").await;
    assert_eq!(b["entries"].as_array().unwrap().len(), 0);
    assert_eq!(b["joined"], false);
}

#[tokio::test]
async fn a_handle_can_browse_boards_without_sharing_or_publishing() {
    let app = server().await;
    let ada = account(&app, "ada@example.com").await;
    let bob = account(&app, "bob@example.com").await;
    let (status, _) = as_user(&app, &ada, Method::GET, routes::PLAYGROUND_FRIENDS, None).await;
    assert_eq!(status, StatusCode::NOT_FOUND, "no handle yet");

    // Bob only wants friends: a handle, nothing shared, even if he asks to.
    let body = json!({ "playground": false, "handle": "bob", "global": true, "shared": ["active"], "lemma": { "look": {}, "name": "", "personality": "calm" } });
    let (status, bob_me) = as_user(&app, &bob, Method::PUT, routes::PLAYGROUND_ME, Some(body)).await;
    assert_eq!(status, StatusCode::OK, "{bob_me}");
    assert_eq!((bob_me["inPlayground"].as_bool(), bob_me["global"].as_bool(), bob_me["shared"].as_array().map(Vec::len)), (Some(false), Some(false), Some(0)));

    let ada_me = join(&app, &ada, "ada", true).await;
    assert_eq!(ada_me["inPlayground"], true);
    let (status, added) = as_user(&app, &bob, Method::POST, routes::PLAYGROUND_FRIENDS, Some(json!({ "code": ada_me["friendCode"] }))).await;
    assert_eq!((status, added["outcome"].as_str()), (StatusCode::OK, Some("friends")), "{added}");

    // Bob can browse, but he shares no scores and cannot publish any.
    let (_, list) = as_user(&app, &bob, Method::GET, routes::PLAYGROUND_FRIENDS, None).await;
    assert_eq!(list["friends"][0]["player"]["handle"], "ada");
    let (status, _) = board(&app, &bob, "active", "week", "friends").await;
    assert_eq!(status, StatusCode::OK);
    let (status, _) = publish(&app, &bob, vec![stats("active", 3, 3)]).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    publish(&app, &ada, vec![stats("active", 4, 4)]).await;
    let (status, browsed) = board(&app, &bob, "active", "week", "friends").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(handles(&browsed), ["ada"]);
    assert_eq!(browsed["joined"], false);
    assert!(browsed["you"].is_null());
    let (status, global) = board(&app, &bob, "active", "week", "global").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(handles(&global), ["ada"]);
    assert_eq!(global["joined"], false);
    let (_, b) = board(&app, &ada, "active", "week", "friends").await;
    assert_eq!(handles(&b), ["ada"], "Bob isn't on Ada's board");
}

#[tokio::test]
async fn leaving_the_playground_keeps_friends_but_deleting_the_account_forgets_everything() {
    let app = server().await;
    let ada = account(&app, "ada@example.com").await;
    let bob = account(&app, "bob@example.com").await;
    let ada_me = join(&app, &ada, "ada", true).await;
    join(&app, &bob, "bob", true).await;
    as_user(&app, &bob, Method::POST, routes::PLAYGROUND_FRIENDS, Some(json!({ "code": ada_me["friendCode"] }))).await;
    publish(&app, &ada, vec![stats("reading.pages", 50, 2)]).await;

    assert_eq!(as_user(&app, &ada, Method::DELETE, routes::PLAYGROUND_ME, None).await.0, StatusCode::NO_CONTENT);
    let (_, me) = as_user(&app, &ada, Method::GET, routes::PLAYGROUND_ME, None).await;
    assert_eq!((me["inPlayground"].as_bool(), me["player"]["handle"].as_str()), (Some(false), Some("ada")));
    let (_, list) = as_user(&app, &bob, Method::GET, routes::PLAYGROUND_FRIENDS, None).await;
    assert_eq!(list["friends"].as_array().unwrap().len(), 1, "still friends");
    let (_, global) = board(&app, &bob, "reading.pages", "week", "global").await;
    assert_eq!(handles(&global), Vec::<String>::new(), "her numbers are gone");

    // Deleting the account frees the handle and removes the friendship.
    let (status, _) = as_user(&app, &ada, Method::DELETE, routes::ACCOUNT, Some(json!({ "password": "correct horse" }))).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, list) = as_user(&app, &bob, Method::GET, routes::PLAYGROUND_FRIENDS, None).await;
    assert_eq!(list["friends"].as_array().unwrap().len(), 0);
    let carol = account(&app, "carol@example.com").await;
    join(&app, &carol, "ada", true).await;
}

#[tokio::test]
async fn pictures_go_only_to_those_who_can_see_you() {
    let app = server().await;
    let ada = account(&app, "ada@example.com").await;
    let bob = account(&app, "bob@example.com").await;
    let eve = account(&app, "eve@example.com").await;
    let picture = "data:image/png;base64,iVBORw0KGgo=";
    as_user(&app, &ada, Method::PUT, routes::PROFILE, Some(json!({ "display_name": "Ada", "avatar": picture }))).await;
    let ada_me = join(&app, &ada, "ada", false).await;
    join(&app, &bob, "bob", false).await;
    join(&app, &eve, "eve", false).await;
    let version = ada_me["player"]["avatar"].as_str().unwrap().to_owned();
    assert_eq!(version.len(), 16, "a version, not the picture");
    let path = route(routes::PLAYGROUND_AVATAR, &[("user_id", ada_me["player"]["userId"].as_str().unwrap())]);

    // Bob, a friend, sees it; Eve, a stranger, doesn't while Ada's off the global boards.
    as_user(&app, &bob, Method::POST, routes::PLAYGROUND_FRIENDS, Some(json!({ "code": ada_me["friendCode"] }))).await;
    let (status, got) = as_user(&app, &bob, Method::GET, &path, None).await;
    assert_eq!((status, got["avatar"].as_str()), (StatusCode::OK, Some(picture)));
    assert_eq!(as_user(&app, &eve, Method::GET, &path, None).await.0, StatusCode::NOT_FOUND);

    // On the global boards, anyone can.
    join(&app, &ada, "ada", true).await;
    assert_eq!(as_user(&app, &eve, Method::GET, &path, None).await.0, StatusCode::OK);

    // A new picture is a new version.
    as_user(&app, &ada, Method::PUT, routes::PROFILE, Some(json!({ "display_name": "Ada", "avatar": "data:image/png;base64,AAAA" }))).await;
    let (_, me) = as_user(&app, &ada, Method::GET, routes::PLAYGROUND_ME, None).await;
    assert_ne!(me["player"]["avatar"].as_str().unwrap(), version);
}
