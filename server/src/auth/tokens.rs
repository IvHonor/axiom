//! The two tokens a signed-in app holds.
//!
//! - The **access token** is a JWT that proves who's asking. It lasts 15
//!   minutes, so a leaked one is soon useless.
//! - The **refresh token** is a random string the app swaps for a new pair.
//!   Each one works once; the server stores only its SHA-256 hash.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const ACCESS_TTL: Duration = Duration::from_secs(15 * 60);
/// A device that doesn't connect for this long has to sign in again.
pub const REFRESH_TTL_DAYS: i64 = 60;

#[derive(Serialize, Deserialize)]
pub struct Claims {
    /// The user's id.
    pub sub: String,
    /// The session (device) the token was issued to.
    pub sid: String,
    pub iat: u64,
    pub exp: u64,
}

/// The unsubscribe link in a notification email. It doesn't expire (old
/// emails keep working) and can't be used for anything else.
#[derive(Serialize, Deserialize)]
struct UnsubscribeClaims {
    sub: String,
    kind: String,
    purpose: String,
}

const UNSUBSCRIBE: &str = "unsubscribe";

pub struct Keys {
    encoding: EncodingKey,
    decoding: DecodingKey,
    validation: Validation,
    link_validation: Validation,
}

impl Keys {
    pub fn new(secret: &[u8]) -> Self {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_required_spec_claims(&["exp", "sub"]);
        let mut link_validation = Validation::new(Algorithm::HS256);
        link_validation.set_required_spec_claims(&["sub"]);
        link_validation.validate_exp = false;
        Self { encoding: EncodingKey::from_secret(secret), decoding: DecodingKey::from_secret(secret), validation, link_validation }
    }

    pub fn unsubscribe_token(&self, user_id: &str, kind: &str) -> String {
        let claims = UnsubscribeClaims { sub: user_id.into(), kind: kind.into(), purpose: UNSUBSCRIBE.into() };
        jsonwebtoken::encode(&Header::new(Algorithm::HS256), &claims, &self.encoding).expect("HS256 signing can't fail")
    }

    /// The user and kind an unsubscribe link is for, if it's genuine.
    pub fn verify_unsubscribe(&self, token: &str) -> Option<(String, String)> {
        let claims = jsonwebtoken::decode::<UnsubscribeClaims>(token, &self.decoding, &self.link_validation).ok()?.claims;
        (claims.purpose == UNSUBSCRIBE).then_some((claims.sub, claims.kind))
    }

    pub fn access_token(&self, user_id: &str, session_id: &str) -> String {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
        let claims = Claims { sub: user_id.into(), sid: session_id.into(), iat: now, exp: now + ACCESS_TTL.as_secs() };
        jsonwebtoken::encode(&Header::new(Algorithm::HS256), &claims, &self.encoding).expect("HS256 signing can't fail")
    }

    /// The token's claims if it's genuine and unexpired.
    pub fn verify(&self, token: &str) -> Option<Claims> {
        jsonwebtoken::decode::<Claims>(token, &self.decoding, &self.validation).ok().map(|data| data.claims)
    }
}

/// 256 random bits, URL-safe.
pub fn new_refresh_token() -> String {
    let mut bytes = [0u8; 32];
    rand::fill(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

/// What gets stored instead of the token. SHA-256 is enough here (no need for
/// Argon2): the token is random, so there's nothing to guess.
pub fn hash_token(token: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(token.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn access_tokens_verify_only_with_the_same_secret() {
        let keys = Keys::new(b"a-test-secret-that-is-long-enough!!");
        let token = keys.access_token("user", "session");
        let claims = keys.verify(&token).expect("valid token");
        assert_eq!((claims.sub.as_str(), claims.sid.as_str()), ("user", "session"));

        let other = Keys::new(b"a-different-secret-also-long-enough");
        assert!(other.verify(&token).is_none());
        assert!(keys.verify("not-a-token").is_none());
    }

    #[test]
    fn unsubscribe_links_only_unsubscribe() {
        let keys = Keys::new(b"a-test-secret-that-is-long-enough!!");
        let link = keys.unsubscribe_token("user", "uni.today");
        assert_eq!(keys.verify_unsubscribe(&link), Some(("user".into(), "uni.today".into())));
        assert!(keys.verify(&link).is_none(), "not a sign-in");
        assert!(keys.verify_unsubscribe(&keys.access_token("user", "session")).is_none(), "a sign-in isn't a link");
        assert!(Keys::new(b"a-different-secret-also-long-enough").verify_unsubscribe(&link).is_none());
    }

    #[test]
    fn refresh_tokens_are_unique_and_hashed() {
        let (a, b) = (new_refresh_token(), new_refresh_token());
        assert_ne!(a, b);
        assert_eq!(a.len(), 43);
        assert_eq!(hash_token(&a), hash_token(&a));
        assert_ne!(hash_token(&a), a);
    }
}
