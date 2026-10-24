import { argon2id } from "hash-wasm";

/**
 * What the website sends in place of the password, made in the browser exactly
 * as the app makes it (src-tauri/src/vault/crypto.rs, `login_key`): Argon2id of
 * the password salted with the email, then hashed under its own label. The
 * password itself never leaves this device, and the key can't open the
 * account's encrypted data.
 */
export async function loginKey(email: string, password: string): Promise<string> {
  const encode = (text: string) => new TextEncoder().encode(text);
  const salt = await sha256(encode("axiom/login-salt/v1/"), encode(normalizeEmail(email)));
  const stretched = await argon2id({ password, salt, parallelism: 1, iterations: 2, memorySize: 19 * 1024, hashLength: 32, outputType: "binary" });
  const key = await sha256(encode("axiom/login/v1"), stretched);
  return `axiom-login:${btoa(String.fromCharCode(...key))}`;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function sha256(...parts: Uint8Array[]) {
  const joined = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", joined));
}
