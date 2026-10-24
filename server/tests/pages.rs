//! The web pages the server serves, and its client address check.

mod common;

use axiom_protocol::routes;
use axum::http::{Method, StatusCode};
use common::*;

async fn page(path: &str, tweak: impl FnOnce(&mut axiom_server::Shared)) -> (StatusCode, String) {
    let app = server_with(tweak).await;
    let response = tower::ServiceExt::oneshot(app, axum::http::Request::get(path).body(axum::body::Body::empty()).unwrap()).await.unwrap();
    let status = response.status();
    let bytes = http_body_util::BodyExt::collect(response.into_body()).await.unwrap().to_bytes();
    (status, String::from_utf8(bytes.to_vec()).unwrap())
}

#[tokio::test]
async fn the_privacy_notice_and_terms_name_who_runs_axiom_and_how_to_reach_them() {
    let tweak = |s: &mut axiom_server::Shared| {
        s.contact_email = Some("support@example.com".into());
        s.operator_name = Some("Ada <Lovelace>".into());
    };
    for path in [routes::PRIVACY, routes::TERMS] {
        let (status, html) = page(path, tweak).await;
        assert_eq!(status, StatusCode::OK);
        assert!(html.contains("mailto:support@example.com"), "{path}");
        assert!(html.contains("Axiom is run by Ada &lt;Lovelace&gt;."), "{path}: names are escaped");
    }
    let (_, privacy) = page(routes::PRIVACY, |_| {}).await;
    assert!(privacy.contains("7 days") && privacy.contains("12 months"), "retention comes from housekeeping");
}

#[tokio::test]
async fn the_client_address_check_shows_what_the_rate_limits_use() {
    let app = server().await;
    let (status, body) = call(&app, Method::GET, routes::CLIENT_IP, None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert!(body["rate_limited_as"].is_string(), "{body}");
}
