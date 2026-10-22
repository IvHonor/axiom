//! Shared boards end to end: sharing, inviting, roles, and syncing a board
//! between accounts, with every permission checked by the server.

mod common;

use std::sync::{Arc, Mutex};

use axiom_protocol::{route, routes};
use axiom_server::mail::{Email, Mailer};
use axum::Router;
use axum::http::{Method, StatusCode};
use common::*;
use serde_json::{Value, json};

const BOARD: &str = "p1";

async fn account(app: &Router, email: &str) -> String {
    let (status, body) = post(app, routes::SIGN_UP, credentials(email, "correct horse")).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["access_token"].as_str().unwrap().into()
}

async fn as_user(app: &Router, token: &str, method: Method, path: &str, body: Option<Value>) -> (StatusCode, Value) {
    call(app, method, path, Some(token), body).await
}

fn row(table: &str, id: &str, fields: Value) -> Value {
    json!({ "table": table, "id": id, "fields": fields, "changed_at": 1000 })
}

async fn push_to_board(app: &Router, token: &str, changes: Value) -> (StatusCode, Value) {
    as_user(app, token, Method::POST, &route(routes::SPACE_PUSH, &[("id", BOARD)]), Some(json!({ "changes": changes }))).await
}

async fn board_rows(app: &Router, token: &str) -> (StatusCode, Vec<String>) {
    let (status, body) = as_user(app, token, Method::GET, &format!("{}?since=0", route(routes::SPACE_PULL, &[("id", BOARD)])), None).await;
    let ids = body["records"].as_array().map(|r| r.iter().map(|x| x["id"].as_str().unwrap().to_owned()).collect()).unwrap_or_default();
    (status, ids)
}

/// Ada shares a board with a project, a column and a task already synced to her account.
async fn shared_board(app: &Router) -> String {
    let ada = account(app, "ada@example.com").await;
    let changes = json!([
        row("project_board_projects", BOARD, json!({ "id": BOARD, "name": "Website" })),
        row("project_board_columns", "c1", json!({ "id": "c1", "project_id": BOARD, "name": "To do" })),
        row("project_board_tasks", "t1", json!({ "id": "t1", "project_id": BOARD, "title": "Fix footer" })),
        // Something private that must stay hers.
        row("daily_plan_tasks", "d1", json!({ "id": "d1", "title": "Dentist" })),
    ]);
    let (status, _) = as_user(app, &ada, Method::POST, routes::SYNC_PUSH, Some(json!({ "changes": changes }))).await;
    assert_eq!(status, StatusCode::OK);
    let (status, space) = as_user(app, &ada, Method::POST, routes::SPACES, Some(json!({ "id": BOARD }))).await;
    assert_eq!((status, space["role"].as_str()), (StatusCode::OK, Some("owner")), "{space}");
    let records = json!({ "records": [
        { "table": "project_board_projects", "id": BOARD },
        { "table": "project_board_columns", "id": "c1" },
        { "table": "project_board_tasks", "id": "t1" },
        // Not a board table: ignored, stays private.
        { "table": "daily_plan_tasks", "id": "d1" },
    ]});
    let (status, adopted) = as_user(app, &ada, Method::POST, &route(routes::SPACE_ADOPT, &[("id", BOARD)]), Some(records)).await;
    assert_eq!((status, adopted["moved"].as_u64()), (StatusCode::OK, Some(3)), "{adopted}");
    ada
}

/// Invites `email` with `role` from `by`, and has them accept.
async fn join(app: &Router, by: &str, email: &str, role: &str) -> String {
    let them = account(app, email).await;
    let (status, invite) =
        as_user(app, by, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), Some(json!({ "email": email, "role": role }))).await;
    assert_eq!(status, StatusCode::OK, "{invite}");
    let (status, _) = as_user(app, &them, Method::POST, &route(routes::INVITE_ACCEPT, &[("id", invite["id"].as_str().unwrap())]), None).await;
    assert_eq!(status, StatusCode::OK);
    them
}

async fn member_id(app: &Router, token: &str, email: &str) -> String {
    let (_, body) = as_user(app, token, Method::GET, &route(routes::SPACE_MEMBERS, &[("id", BOARD)]), None).await;
    body["members"].as_array().unwrap().iter().find(|m| m["email"] == email).unwrap()["user_id"].as_str().unwrap().into()
}

#[tokio::test]
async fn sharing_moves_the_board_out_of_your_private_data() {
    let app = server().await;
    let ada = shared_board(&app).await;

    let (status, ids) = board_rows(&app, &ada).await;
    assert_eq!((status, ids), (StatusCode::OK, vec![BOARD.to_owned(), "c1".into(), "t1".into()]));
    let (_, personal) = as_user(&app, &ada, Method::GET, &format!("{}?since=0", routes::SYNC_PULL), None).await;
    let personal: Vec<&str> = personal["records"].as_array().unwrap().iter().map(|r| r["id"].as_str().unwrap()).collect();
    assert_eq!(personal, ["d1"]);

    let (_, spaces) = as_user(&app, &ada, Method::GET, routes::SPACES, None).await;
    assert_eq!(spaces[0]["name"], "Website");
    assert_eq!(spaces[0]["owner_email"], "ada@example.com");
    // Sharing twice isn't possible.
    let (status, _) = as_user(&app, &ada, Method::POST, routes::SPACES, Some(json!({ "id": BOARD }))).await;
    assert_eq!(status, StatusCode::CONFLICT);
}

#[tokio::test]
async fn an_invitation_is_emailed_and_accepted_in_the_app() {
    let sent: Arc<Mutex<Vec<Email>>> = Arc::default();
    let mail = sent.clone();
    let app = server_with(|s| s.mailer = Mailer::Memory(mail)).await;
    let ada = shared_board(&app).await;
    let bob = account(&app, "bob@example.com").await;

    let (status, invite) =
        as_user(&app, &ada, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), Some(json!({ "email": " Bob@Example.com ", "role": "editor" })))
            .await;
    assert_eq!((status, invite["email"].as_str()), (StatusCode::OK, Some("bob@example.com")), "{invite}");
    let email = sent.lock().unwrap()[0].clone();
    assert_eq!(email.to, "bob@example.com");
    assert!(email.subject.contains("ada@example.com") && email.subject.contains("Website"), "{}", email.subject);

    // Not a member yet: nothing to pull.
    assert_eq!(board_rows(&app, &bob).await.0, StatusCode::NOT_FOUND);
    let (_, mine) = as_user(&app, &bob, Method::GET, routes::INVITES, None).await;
    assert_eq!((mine[0]["space_name"].as_str(), mine[0]["role"].as_str()), (Some("Website"), Some("editor")));

    let (status, joined) = as_user(&app, &bob, Method::POST, &route(routes::INVITE_ACCEPT, &[("id", mine[0]["id"].as_str().unwrap())]), None).await;
    assert_eq!((status, joined["role"].as_str(), joined["members"].as_u64()), (StatusCode::OK, Some("editor"), Some(2)));
    assert_eq!(board_rows(&app, &bob).await.1, vec![BOARD.to_owned(), "c1".into(), "t1".into()]);
    // Answered: it's gone from the list, and can't be used twice.
    let (_, mine) = as_user(&app, &bob, Method::GET, routes::INVITES, None).await;
    assert_eq!(mine, json!([]));
    let (status, _) = as_user(&app, &bob, Method::POST, &route(routes::INVITE_ACCEPT, &[("id", invite["id"].as_str().unwrap())]), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Someone else can't accept an invitation that isn't theirs.
    let (_, other) =
        as_user(&app, &ada, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), Some(json!({ "email": "cy@example.com", "role": "viewer" }))).await;
    let (status, _) = as_user(&app, &bob, Method::POST, &route(routes::INVITE_ACCEPT, &[("id", other["id"].as_str().unwrap())]), None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn roles_limit_what_each_member_can_change() {
    let app = server().await;
    let ada = shared_board(&app).await;
    let bob = join(&app, &ada, "bob@example.com", "editor").await;
    let cy = join(&app, &ada, "cy@example.com", "viewer").await;
    let stranger = account(&app, "eve@example.com").await;

    let card = json!([row("project_board_tasks", "t2", json!({ "id": "t2", "project_id": BOARD, "title": "New card" }))]);
    let column = json!([row("project_board_columns", "c2", json!({ "id": "c2", "project_id": BOARD, "name": "Done" }))]);
    // Editors work on cards, not the board itself.
    assert_eq!(push_to_board(&app, &bob, card.clone()).await.0, StatusCode::OK);
    let (status, body) = push_to_board(&app, &bob, column.clone()).await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
    assert!(body["message"].as_str().unwrap().contains("editor"));
    // Viewers change nothing; strangers can't even see it.
    assert_eq!(push_to_board(&app, &cy, card.clone()).await.0, StatusCode::FORBIDDEN);
    assert_eq!(board_rows(&app, &cy).await.0, StatusCode::OK);
    assert_eq!(push_to_board(&app, &stranger, card.clone()).await.0, StatusCode::NOT_FOUND);
    assert_eq!(board_rows(&app, &stranger).await.0, StatusCode::NOT_FOUND);
    // The owner changes anything on the board, but nothing private goes in it.
    assert_eq!(push_to_board(&app, &ada, column).await.0, StatusCode::OK);
    let private = json!([row("daily_plan_tasks", "d9", json!({ "id": "d9" }))]);
    assert_eq!(push_to_board(&app, &ada, private).await.0, StatusCode::BAD_REQUEST);

    // Viewers see members but not pending invitations; admins see both.
    as_user(&app, &ada, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), Some(json!({ "email": "dee@example.com", "role": "viewer" }))).await;
    let (_, seen) = as_user(&app, &cy, Method::GET, &route(routes::SPACE_MEMBERS, &[("id", BOARD)]), None).await;
    assert_eq!((seen["members"].as_array().unwrap().len(), seen["invites"].as_array().unwrap().len()), (3, 0));
    let (_, seen) = as_user(&app, &ada, Method::GET, &route(routes::SPACE_MEMBERS, &[("id", BOARD)]), None).await;
    assert_eq!(seen["invites"].as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn admins_manage_members_and_only_the_owner_manages_admins() {
    let app = server().await;
    let ada = shared_board(&app).await;
    let bob = join(&app, &ada, "bob@example.com", "admin").await;
    let cy = join(&app, &ada, "cy@example.com", "editor").await;
    let dee = join(&app, &ada, "dee@example.com", "editor").await;
    let (ada_id, bob_id, cy_id, dee_id) = (
        member_id(&app, &ada, "ada@example.com").await,
        member_id(&app, &ada, "bob@example.com").await,
        member_id(&app, &ada, "cy@example.com").await,
        member_id(&app, &ada, "dee@example.com").await,
    );
    let set = |who: &str, role: &str| (route(routes::SPACE_MEMBER, &[("id", BOARD), ("user_id", who)]), Some(json!({ "role": role })));

    // An admin can invite editors and viewers, but not admins.
    let invite = |role: &str| Some(json!({ "email": "new@example.com", "role": role }));
    assert_eq!(as_user(&app, &bob, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), invite("viewer")).await.0, StatusCode::OK);
    assert_eq!(as_user(&app, &bob, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), invite("admin")).await.0, StatusCode::FORBIDDEN);
    // Nobody invites a second owner, and editors invite nobody.
    assert_eq!(as_user(&app, &ada, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), invite("owner")).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(as_user(&app, &cy, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), invite("viewer")).await.0, StatusCode::FORBIDDEN);
    // Inviting someone already on the board.
    let again = Some(json!({ "email": "cy@example.com", "role": "viewer" }));
    assert_eq!(as_user(&app, &ada, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), again).await.0, StatusCode::CONFLICT);

    // An admin changes editors and viewers...
    let (path, body) = set(&cy_id, "viewer");
    assert_eq!(as_user(&app, &bob, Method::PATCH, &path, body).await.0, StatusCode::NO_CONTENT);
    // ...but can't make admins, touch the owner, or be changed by an editor.
    let (path, body) = set(&cy_id, "admin");
    assert_eq!(as_user(&app, &bob, Method::PATCH, &path, body).await.0, StatusCode::FORBIDDEN);
    let (path, body) = set(&ada_id, "editor");
    assert_eq!(as_user(&app, &bob, Method::PATCH, &path, body).await.0, StatusCode::BAD_REQUEST);
    let (path, body) = set(&bob_id, "viewer");
    assert_eq!(as_user(&app, &dee, Method::PATCH, &path, body).await.0, StatusCode::FORBIDDEN);
    // The owner can.
    let (path, body) = set(&bob_id, "editor");
    assert_eq!(as_user(&app, &ada, Method::PATCH, &path, body).await.0, StatusCode::NO_CONTENT);

    // Removing: admins remove others, anyone can leave, the owner can't.
    let (path, body) = set(&bob_id, "admin");
    as_user(&app, &ada, Method::PATCH, &path, body).await;
    let remove = |who: &str| route(routes::SPACE_MEMBER, &[("id", BOARD), ("user_id", who)]);
    assert_eq!(as_user(&app, &bob, Method::DELETE, &remove(&cy_id), None).await.0, StatusCode::NO_CONTENT);
    assert_eq!(board_rows(&app, &cy).await.0, StatusCode::NOT_FOUND);
    assert_eq!(as_user(&app, &bob, Method::DELETE, &remove(&ada_id), None).await.0, StatusCode::BAD_REQUEST);
    assert_eq!(as_user(&app, &dee, Method::DELETE, &remove(&bob_id), None).await.0, StatusCode::FORBIDDEN);
    assert_eq!(as_user(&app, &dee, Method::DELETE, &remove(&dee_id), None).await.0, StatusCode::NO_CONTENT);
    assert_eq!(as_user(&app, &ada, Method::DELETE, &remove(&ada_id), None).await.0, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn invitations_can_be_withdrawn_or_declined() {
    let app = server().await;
    let ada = shared_board(&app).await;
    let bob = account(&app, "bob@example.com").await;
    let send = |role: &str| Some(json!({ "email": "bob@example.com", "role": role }));

    let (_, first) = as_user(&app, &ada, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), send("viewer")).await;
    // Inviting again replaces the first, with the new role.
    let (_, second) = as_user(&app, &ada, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), send("editor")).await;
    let (_, mine) = as_user(&app, &bob, Method::GET, routes::INVITES, None).await;
    assert_eq!((mine.as_array().unwrap().len(), mine[0]["role"].as_str()), (1, Some("editor")));
    assert_ne!(first["id"], second["id"]);

    let path = route(routes::SPACE_INVITE, &[("id", BOARD), ("invite_id", second["id"].as_str().unwrap())]);
    assert_eq!(as_user(&app, &ada, Method::DELETE, &path, None).await.0, StatusCode::NO_CONTENT);
    let (_, mine) = as_user(&app, &bob, Method::GET, routes::INVITES, None).await;
    assert_eq!(mine, json!([]));

    let (_, third) = as_user(&app, &ada, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), send("viewer")).await;
    let decline = route(routes::INVITE_DECLINE, &[("id", third["id"].as_str().unwrap())]);
    assert_eq!(as_user(&app, &bob, Method::POST, &decline, None).await.0, StatusCode::NO_CONTENT);
    let accept = route(routes::INVITE_ACCEPT, &[("id", third["id"].as_str().unwrap())]);
    assert_eq!(as_user(&app, &bob, Method::POST, &accept, None).await.0, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn invitations_are_rate_limited() {
    let app = server().await;
    let ada = shared_board(&app).await;
    let invite = |n: usize| Some(json!({ "email": format!("person{n}@example.com"), "role": "viewer" }));
    for n in 0..20 {
        assert_eq!(as_user(&app, &ada, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), invite(n)).await.0, StatusCode::OK);
    }
    assert_eq!(as_user(&app, &ada, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), invite(20)).await.0, StatusCode::TOO_MANY_REQUESTS);
}

#[tokio::test]
async fn the_owner_stops_sharing_or_deletes_their_account_and_the_board_goes() {
    let app = server().await;
    let ada = shared_board(&app).await;
    let bob = join(&app, &ada, "bob@example.com", "admin").await;

    // Only the owner can stop sharing.
    assert_eq!(as_user(&app, &bob, Method::DELETE, &route(routes::SPACE, &[("id", BOARD)]), None).await.0, StatusCode::FORBIDDEN);
    assert_eq!(as_user(&app, &ada, Method::DELETE, &route(routes::SPACE, &[("id", BOARD)]), None).await.0, StatusCode::NO_CONTENT);
    let (_, spaces) = as_user(&app, &bob, Method::GET, routes::SPACES, None).await;
    assert_eq!(spaces, json!([]));

    // Shared again, then the owner deletes their account.
    let (status, _) = as_user(&app, &ada, Method::POST, routes::SPACES, Some(json!({ "id": BOARD }))).await;
    assert_eq!(status, StatusCode::OK);
    let (_, invite) =
        as_user(&app, &ada, Method::POST, &route(routes::SPACE_INVITES, &[("id", BOARD)]), Some(json!({ "email": "bob@example.com", "role": "editor" }))).await;
    as_user(&app, &bob, Method::POST, &route(routes::INVITE_ACCEPT, &[("id", invite["id"].as_str().unwrap())]), None).await;
    let (status, _) = as_user(&app, &ada, Method::DELETE, routes::ACCOUNT, Some(json!({ "password": "correct horse" }))).await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, spaces) = as_user(&app, &bob, Method::GET, routes::SPACES, None).await;
    assert_eq!(spaces, json!([]));
}
