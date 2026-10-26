#!/bin/sh
# decrypt.sh <log file> <out.json>: reads the encrypted block printed by the "Esporta regia" workflow
set -e
LOG=$1; OUT=$2; T=$(mktemp -d)
sed -n '/-----CHIAVE-----/,/-----DATI-----/p' "$LOG" | grep -v -- '-----' | sed 's/^.*Z //' | tr -d ' \r' | base64 -d > $T/k.enc
sed -n '/-----DATI-----/,/-----FINE-----/p' "$LOG" | grep -v -- '-----' | sed 's/^.*Z //' | tr -d ' \r' | base64 -d > $T/d.enc
openssl pkeyutl -decrypt -inkey /root/.config/cinque-regia/key.pem -pkeyopt rsa_padding_mode:oaep -in $T/k.enc -out $T/k
# the fingerprint line of the log, when present, must match the copied block
WANT=$(grep -o 'SHA256 [0-9a-f]\{64\}' "$LOG" | head -1 | cut -d' ' -f2)
if [ -n "$WANT" ]; then
  GOT=$(sha256sum $T/d.enc | cut -d' ' -f1)
  [ "$WANT" = "$GOT" ] || { echo "copia danneggiata: impronta diversa, rilancia l'esportazione" >&2; rm -rf $T; exit 1; }
fi
openssl enc -d -aes-256-cbc -pbkdf2 -in $T/d.enc -pass file:$T/k | gunzip > "$OUT"
rm -rf $T
