#!/bin/bash
# Puts Axiom's macOS signing certificate (see make-mac-signing-cert.sh) into
# a keychain of its own on the release build machine, so `codesign` can use
# it, and prints the identity to sign with. Used by .github/workflows/release.yml.
#
#   MACOS_CERTIFICATE=<base64 .p12> MACOS_CERTIFICATE_PASSWORD=<password> \
#     bash scripts/import-mac-signing-cert.sh <keychain path>
set -euo pipefail

KEYCHAIN="$1"
NAME="Axiom Code Signing"
: "${MACOS_CERTIFICATE:?MACOS_CERTIFICATE is empty}"
: "${MACOS_CERTIFICATE_PASSWORD:?MACOS_CERTIFICATE_PASSWORD is empty}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
printf '%s' "$MACOS_CERTIFICATE" | tr -d '[:space:]' | base64 --decode > "$WORK/cert.p12"

KEYCHAIN_PASSWORD="$(openssl rand -hex 24)"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$WORK/cert.p12" -k "$KEYCHAIN" -P "$MACOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign >/dev/null
# Lets codesign use the key without a dialog nobody's there to click.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
# Searched along with the usual keychains.
security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')

# The SHA-1 of the certificate: an exact identity, whatever else is installed.
IDENTITY="$(security find-identity -p codesigning "$KEYCHAIN" | awk -v name="\"$NAME\"" 'index($0, name) { print $2; exit }')"
if [ -z "$IDENTITY" ]; then
  echo "::error::The certificate in MACOS_CERTIFICATE isn't a code-signing identity named \"$NAME\". Make it with scripts/make-mac-signing-cert.sh." >&2
  exit 1
fi
echo "$IDENTITY"
