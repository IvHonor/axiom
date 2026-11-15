#!/bin/bash
# Makes the certificate Axiom's macOS releases are signed with, once.
#
# Every release signed with the same certificate is the same app to macOS,
# so "Always Allow" on the keychain prompt lasts through updates. (Without
# it, each build is signed with a throwaway identity and macOS asks again.)
# It's self-signed: free, but it doesn't remove the "unidentified developer"
# warning on first install; only Apple's paid Developer ID does that.
#
#   bash scripts/make-mac-signing-cert.sh
#
# Writes to ~/axiom-signing (outside the repo, so it can't be committed):
#   axiom-signing.p12        the certificate and its private key: BACK THIS UP
#   github-secret.txt        paste into the MACOS_CERTIFICATE secret
#   password.txt             paste into the MACOS_CERTIFICATE_PASSWORD secret
# Lose the .p12 and everyone sees the keychain prompt once more after the
# next update, signed with a new one.
set -euo pipefail

NAME="Axiom Code Signing"
OUT="${1:-$HOME/axiom-signing}"
# The system's LibreSSL writes .p12 files the macOS keychain can read
# (Homebrew's OpenSSL 3 needs extra flags for that).
OPENSSL=/usr/bin/openssl

if [ -e "$OUT/axiom-signing.p12" ]; then
  echo "There's already a certificate in $OUT. Use that one: a new one makes everyone allow Axiom again." >&2
  exit 1
fi
mkdir -p "$OUT"
chmod 700 "$OUT"
cd "$OUT"

cat > openssl.cnf <<EOF
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = $NAME
[ext]
basicConstraints = critical, CA:FALSE
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
subjectKeyIdentifier = hash
EOF

PASSWORD="$($OPENSSL rand -hex 24)"
# Twenty years: macOS keeps recognising the app by this certificate itself,
# so it never needs renewing for that.
$OPENSSL req -x509 -newkey rsa:2048 -nodes -days 7300 -config openssl.cnf -keyout key.pem -out cert.pem 2>/dev/null
$OPENSSL pkcs12 -export -inkey key.pem -in cert.pem -name "$NAME" -out axiom-signing.p12 -passout "pass:$PASSWORD"
rm -f key.pem openssl.cnf
base64 -i axiom-signing.p12 | tr -d '\n' > github-secret.txt
printf '%s' "$PASSWORD" > password.txt
chmod 600 axiom-signing.p12 github-secret.txt password.txt cert.pem

echo
echo "Done. Made '$NAME' in $OUT"
echo
echo "Next:"
echo "  1. Back up $OUT/axiom-signing.p12 and password.txt somewhere safe (a password manager)."
echo "  2. On GitHub: Settings > Secrets and variables > Actions > New repository secret"
echo "       MACOS_CERTIFICATE           = the contents of github-secret.txt"
echo "       MACOS_CERTIFICATE_PASSWORD  = the contents of password.txt"
echo "     To copy one:  pbcopy < $OUT/github-secret.txt"
