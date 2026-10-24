//! The cryptography: sealing fields, and wrapping the data key.

use argon2::{Algorithm, Argon2, Params, Version};
use axiom_protocol::{LOGIN_KEY_PREFIX, normalize_email};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

/// Marks a sealed field value: version 1, then base64 of nonce and ciphertext.
const SEALED: &str = "e1:";
/// OWASP's recommended Argon2id settings: 19 MiB, two passes.
const KDF_MEMORY_KIB: u32 = 19 * 1024;
const KDF_PASSES: u32 = 2;
/// Recovery codes are 20 random bytes: 160 bits, written as 32 letters and digits.
const RECOVERY_BYTES: usize = 20;

/// Something didn't decrypt: the wrong key, or data that was tampered with.
#[derive(Debug)]
pub struct Broken;

/// The account's 256-bit data key.
#[derive(Clone, PartialEq)]
pub struct DataKey([u8; 32]);

impl std::fmt::Debug for DataKey {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("DataKey(…)")
    }
}

fn random<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    getrandom::fill(&mut bytes).expect("the system's random number generator works");
    bytes
}

fn seal_bytes(key: &[u8; 32], aad: &[u8], plain: &[u8]) -> String {
    let nonce: [u8; 24] = random();
    let cipher = XChaCha20Poly1305::new(key.into());
    let sealed = cipher.encrypt(XNonce::from_slice(&nonce), Payload { msg: plain, aad }).expect("encryption can't fail");
    B64.encode([nonce.as_slice(), &sealed].concat())
}

fn open_bytes(key: &[u8; 32], aad: &[u8], text: &str) -> Result<Vec<u8>, Broken> {
    let bytes = B64.decode(text).map_err(|_| Broken)?;
    if bytes.len() < 24 + 16 {
        return Err(Broken);
    }
    let (nonce, sealed) = bytes.split_at(24);
    XChaCha20Poly1305::new(key.into()).decrypt(XNonce::from_slice(nonce), Payload { msg: sealed, aad }).map_err(|_| Broken)
}

impl DataKey {
    pub fn generate() -> Self {
        Self(random())
    }

    pub fn to_base64(&self) -> String {
        B64.encode(self.0)
    }

    pub fn from_base64(text: &str) -> Option<Self> {
        B64.decode(text).ok()?.try_into().ok().map(Self)
    }

    fn aad(table: &str, id: &str, field: &str) -> Vec<u8> {
        format!("axiom/{table}/{id}/{field}").into_bytes()
    }

    /// Seals every field but `id` (which the server needs to keep rows apart).
    pub fn seal_fields(&self, table: &str, id: &str, fields: &Map<String, Value>) -> Map<String, Value> {
        fields
            .iter()
            .map(|(name, value)| {
                if name == "id" {
                    return (name.clone(), value.clone());
                }
                let plain = serde_json::to_vec(value).expect("JSON values serialise");
                (name.clone(), Value::String(format!("{SEALED}{}", seal_bytes(&self.0, &Self::aad(table, id, name), &plain))))
            })
            .collect()
    }

    /// Opens sealed fields. Anything not sealed with this key, in this place,
    /// is refused: a value the server made up can't slip in.
    pub fn open_fields(&self, table: &str, id: &str, fields: &Map<String, Value>) -> Result<Map<String, Value>, Broken> {
        fields
            .iter()
            .map(|(name, value)| {
                if name == "id" {
                    return Ok((name.clone(), value.clone()));
                }
                let text = value.as_str().and_then(|s| s.strip_prefix(SEALED)).ok_or(Broken)?;
                let plain = open_bytes(&self.0, &Self::aad(table, id, name), text)?;
                Ok((name.clone(), serde_json::from_slice(&plain).map_err(|_| Broken)?))
            })
            .collect()
    }
}

/// The data key as the server keeps it: sealed with the password and with
/// the recovery code, plus the recovery code sealed with the data key (so an
/// unlocked device can show it again).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Wrapped {
    v: u8,
    /// Argon2id salt and settings for the password.
    salt: String,
    memory: u32,
    passes: u32,
    by_password: String,
    by_recovery: String,
    recovery: String,
}

fn password_key(password: &str, salt: &[u8], memory: u32, passes: u32) -> Result<[u8; 32], Broken> {
    let params = Params::new(memory, passes, 1, Some(32)).map_err(|_| Broken)?;
    let mut out = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params).hash_password_into(password.as_bytes(), salt, &mut out).map_err(|_| Broken)?;
    Ok(out)
}

/// What the app sends the server in place of the password: Argon2id of it,
/// salted with the email, then hashed under its own label. The server checks
/// it like a password, but can't turn it into a key that unwraps the data key,
/// even by handing out a wrapped key with this salt.
pub fn login_key(email: &str, password: &str) -> String {
    let salt: [u8; 32] = Sha256::new().chain_update(b"axiom/login-salt/v1/").chain_update(normalize_email(email)).finalize().into();
    let stretched = password_key(password, &salt, KDF_MEMORY_KIB, KDF_PASSES).expect("fixed settings are valid");
    let key: [u8; 32] = Sha256::new().chain_update(b"axiom/login/v1").chain_update(stretched).finalize().into();
    format!("{LOGIN_KEY_PREFIX}{}", B64.encode(key))
}

fn recovery_key(code: &[u8]) -> [u8; 32] {
    Sha256::new().chain_update(b"axiom-recovery-v1").chain_update(code).finalize().into()
}

/// "ABCD-EFGH-…" (base32, so no 0/O or 1/I mix-ups).
fn show(code: &[u8]) -> String {
    const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut bits = 0u32;
    let mut count = 0;
    let mut out = String::new();
    for byte in code {
        bits = (bits << 8) | *byte as u32;
        count += 8;
        while count >= 5 {
            count -= 5;
            out.push(ALPHABET[((bits >> count) & 31) as usize] as char);
        }
    }
    out.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap()).collect::<Vec<_>>().join("-")
}

fn read(code: &str) -> Option<Vec<u8>> {
    let mut bits = 0u32;
    let mut count = 0;
    let mut out = Vec::new();
    for c in code.chars().filter(char::is_ascii_alphanumeric) {
        let c = c.to_ascii_uppercase();
        let value = match c {
            'A'..='Z' => c as u32 - 'A' as u32,
            '2'..='7' => c as u32 - '2' as u32 + 26,
            // Typed by hand from a written-down code: 0 and 1 are O and I.
            '0' => 'O' as u32 - 'A' as u32,
            '1' => 'I' as u32 - 'A' as u32,
            _ => return None,
        };
        bits = (bits << 5) | value;
        count += 5;
        if count >= 8 {
            count -= 8;
            out.push((bits >> count) as u8);
        }
    }
    (out.len() == RECOVERY_BYTES).then_some(out)
}

impl Wrapped {
    /// A new data key and its wrapping for `password`, with a new recovery code.
    pub fn create(password: &str) -> Result<(DataKey, Wrapped), Broken> {
        let key = DataKey::generate();
        let code: [u8; RECOVERY_BYTES] = random();
        let mut wrapped = Wrapped {
            v: 1,
            salt: String::new(),
            memory: KDF_MEMORY_KIB,
            passes: KDF_PASSES,
            by_password: String::new(),
            by_recovery: seal_bytes(&recovery_key(&code), b"axiom/key", &key.0),
            recovery: seal_bytes(&key.0, b"axiom/recovery", &code),
        };
        wrapped = wrapped.with_password(&key, password)?;
        Ok((key, wrapped))
    }

    pub fn parse(text: &str) -> Result<Wrapped, Broken> {
        serde_json::from_str(text).map_err(|_| Broken)
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string(self).expect("serialises")
    }

    pub fn open_with_password(&self, password: &str) -> Result<DataKey, Broken> {
        let salt = B64.decode(&self.salt).map_err(|_| Broken)?;
        let kek = password_key(password, &salt, self.memory, self.passes)?;
        let bytes = open_bytes(&kek, b"axiom/key", &self.by_password)?;
        bytes.try_into().map(DataKey).map_err(|_| Broken)
    }

    pub fn open_with_recovery(&self, code: &str) -> Result<DataKey, Broken> {
        let code = read(code).ok_or(Broken)?;
        let bytes = open_bytes(&recovery_key(&code), b"axiom/key", &self.by_recovery)?;
        bytes.try_into().map(DataKey).map_err(|_| Broken)
    }

    /// The same key, wrapped for a (new) password with a fresh salt.
    pub fn with_password(&self, key: &DataKey, password: &str) -> Result<Wrapped, Broken> {
        let salt: [u8; 16] = random();
        let kek = password_key(password, &salt, KDF_MEMORY_KIB, KDF_PASSES)?;
        Ok(Wrapped {
            salt: B64.encode(salt),
            memory: KDF_MEMORY_KIB,
            passes: KDF_PASSES,
            by_password: seal_bytes(&kek, b"axiom/key", &key.0),
            ..self.clone()
        })
    }

    pub fn recovery_code(&self, key: &DataKey) -> Result<String, Broken> {
        Ok(show(&open_bytes(&key.0, b"axiom/recovery", &self.recovery)?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn fields_round_trip_and_stay_where_they_were_sealed() {
        let key = DataKey::generate();
        let row = json!({ "id": "t1", "amount": -1250, "payee": "Tesco", "notes": null }).as_object().unwrap().clone();
        let sealed = key.seal_fields("finance_transactions", "t1", &row);
        assert_eq!(sealed["id"], "t1", "the id stays readable");
        assert!(sealed["payee"].as_str().unwrap().starts_with("e1:") && !serde_json::Value::Object(sealed.clone()).to_string().contains("Tesco"));
        assert_eq!(key.open_fields("finance_transactions", "t1", &sealed).unwrap(), row);

        // Moved to another row or field, or opened with another key: refused.
        assert!(key.open_fields("finance_transactions", "t2", &sealed).is_err());
        let mut swapped = sealed.clone();
        swapped.insert("notes".into(), sealed["payee"].clone());
        assert!(key.open_fields("finance_transactions", "t1", &swapped).is_err());
        assert!(DataKey::generate().open_fields("finance_transactions", "t1", &sealed).is_err());
        // A plain value the server made up isn't accepted either.
        let forged = json!({ "id": "t1", "amount": 1 }).as_object().unwrap().clone();
        assert!(key.open_fields("finance_transactions", "t1", &forged).is_err());
    }

    #[test]
    fn the_key_unwraps_with_the_password_or_the_recovery_code() {
        let (key, wrapped) = Wrapped::create("correct horse").unwrap();
        let stored = Wrapped::parse(&wrapped.to_json()).unwrap();
        assert_eq!(stored.open_with_password("correct horse").unwrap(), key);
        assert!(stored.open_with_password("wrong horse").is_err());

        let code = stored.recovery_code(&key).unwrap();
        assert_eq!(code.len(), 32 + 7, "eight groups of four");
        assert_eq!(stored.open_with_recovery(&code).unwrap(), key);
        assert_eq!(stored.open_with_recovery(&code.to_lowercase().replace('-', " ")).unwrap(), key, "typed loosely");
        assert!(stored.open_with_recovery("AAAA-AAAA").is_err());

        // A new password: same key, same recovery code.
        let changed = stored.with_password(&key, "battery staple").unwrap();
        assert_eq!(changed.open_with_password("battery staple").unwrap(), key);
        assert!(changed.open_with_password("correct horse").is_err());
        assert_eq!(changed.recovery_code(&key).unwrap(), code);
    }

    #[test]
    fn the_login_key_is_the_same_on_every_device_and_opens_nothing() {
        let key = login_key("ada@example.com", "correct horse");
        assert!(axiom_protocol::is_login_key(&key), "{key}");
        assert_eq!(login_key(" Ada@Example.com", "correct horse"), key);
        assert_ne!(login_key("bob@example.com", "correct horse"), key);
        assert_ne!(login_key("ada@example.com", "wrong horse"), key);

        // A server that knows the login key, and wraps a key of its own with
        // the login salt, still can't get this device to accept it.
        let (_, wrapped) = Wrapped::create("correct horse").unwrap();
        let mut forged = wrapped.clone();
        let salt: [u8; 32] = Sha256::new().chain_update(b"axiom/login-salt/v1/").chain_update("ada@example.com").finalize().into();
        let known: [u8; 32] = B64.decode(key.strip_prefix(LOGIN_KEY_PREFIX).unwrap()).unwrap().try_into().unwrap();
        forged.salt = B64.encode(salt);
        forged.by_password = seal_bytes(&known, b"axiom/key", &DataKey::generate().0);
        assert!(forged.open_with_password("correct horse").is_err());
    }
}
