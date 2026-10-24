#!/bin/sh
# decrypt.sh <log file> <out.json>: reads the encrypted block printed by the "Esporta regia" workflow
set -e
LOG=$1; OUT=$2; T=$(mktemp -d)
sed -n '/-----CHIAVE-----/,/-----DATI-----/p' "$LOG" | grep -v -- '-----' | sed 's/^.*Z //' | tr -d ' \r' | base64 -d > $T/k.enc
sed -n '/-----DATI-----/,/-----FINE-----/p' "$LOG" | grep -v -- '-----' | sed 's/^.*Z //' | tr -d ' \r' | base64 -d > $T/d.enc
openssl pkeyutl -decrypt -inkey /root/.config/cinque-regia/key.pem -pkeyopt rsa_padding_mode:oaep -in $T/k.enc -out $T/k
openssl enc -d -aes-256-cbc -pbkdf2 -in $T/d.enc -out "$OUT" -pass file:$T/k
rm -rf $T
