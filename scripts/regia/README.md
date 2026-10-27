# Regia: aggiornare la dashboard di controllo

La regia è una dashboard privata del proprietario: https://claude.ai/artifact/EWucDwXHFKLgoGdbBTshQw
I dati arrivano come file allegati e non entrano mai nel repository. Lavora nella cartella scratchpad della sessione (qui `$S`).

1. **Profili e messaggi.** Avvia il workflow `regia.yml` (strumento GitHub `actions_run_trigger`, `run_workflow`, ref `claude/personal-news-dashboard-f1mny6`).
   - Aspetta che finisca (`actions_list` → `list_workflow_runs`, poi `list_workflow_jobs`) e leggi il log del job con `get_job_logs` e `return_content: true`.
   - Copia in `$S/log.txt` le righe da `-----CHIAVE-----` a `-----FINE-----`, più la riga `SHA256 ...` che segue (i timestamp all'inizio delle righe si possono lasciare). Ogni riga ha numero e checksum: se lo script di decifratura dice "riga NNN sbagliata", rileggi quelle righe dal log e correggi solo quelle (con `sed -i 'NNNs/.*/riga giusta/'`), poi rilancia. Non cancellare il log finché la decifratura non è riuscita. L'host dei log scaricabili (blob.core.windows.net) è bloccato dalla rete: la copia a mano è l'unica strada.
   - Esegui `sh scripts/regia/decrypt.sh $S/log.txt $S/export.json`.
   - Solo dopo una decifratura riuscita cancella il log del run con `actions_run_trigger`, `delete_workflow_run_logs`.
2. **Consumo.** Esegui `node scripts/regia/consumo.mjs $S/consumo.json` e annota il totale "$ dal registro".
3. **Sessioni.** Prendi i dati da `list_sessions` (`mine: true`) e scrivi `$S/sessioni.json` come `{sessioni: [{titolo, progetto, costo, creata, aggiornata}]}`.
   - `progetto` vale "Cinque al Mattino" per questa sessione e per le redazioni automatiche, "Altri progetti" per il resto.
   - Per questa sessione `costo` è il totale del passo 2, non quello di `list_sessions`.
4. **Limiti dell'abbonamento.** Leggi gli eventi recenti con `list_events` (questa sessione, `kinds: ["rate_limit_event"]`, `limit: 100`); se la pagina è vuota, torna indietro con `before_id`. Da ogni evento prendi `unifiedWindows`:
   - `five_hour` diventa la finestra "5 ore", `seven_day` la finestra "7 giorni";
   - ogni lettura è `{letto: created_at, finestra, usato: utilization, si_azzera: resetsAt in ISO}`;
   - scrivi `$S/limiti.json` come `{letture: [...], extra: {in_uso, stato, motivo}}`;
   - `extra` viene da `isUsingOverage` e `overageStatus`: oggi è `{"in_uso": "no", "stato": "disattivato", "motivo": "l'uso extra a pagamento è disattivato sul tuo account"}`. Se cambia, dillo nella riga finale.

   Lo storico si accumula da solo in `/root/.config/cinque-regia/limiti-storia.json`.
5. **File.** Esegui `node scripts/regia/build.mjs $S/export.json $S/consumo.json $S/sessioni.json $S/limiti.json $S/out`.
6. **Caricamento.** Carica ogni file di `$S/out` con lo strumento Artifact (`url` della regia, `asset: true`, un file per chiamata).
   - Leggi le versioni con ArtifactData `list` della collezione `datasets`.
   - Con un solo `batch` aggiorna `source.url`, `source.name` e `updated: {at, by: "Claude"}` dei dataset `consumo`, `utenti`, `attivita`, `notizie`, `messaggi` (è un CSV), `sessioni`, `limiti`, `limiti_storia` ed `extra`, passando `if_version`. `stime` resta fisso.
   - Infine elimina i file decifrati (`$S/export.json`, `$S/log.txt`).
   - Poi cancella gli allegati vecchi (Artifact `delete` con `url` e `path` = id): sono quelli che i dataset non citano più.

**Chiave privata.** Si trova in `/root/.config/cinque-regia/key.pem`, fuori dal repository. Se il container è stato ricreato e la chiave manca:
- generane una nuova: `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out key.pem`;
- scrivi la chiave pubblica in `config/regia.pub.pem` con `openssl pkey -in key.pem -pubout`;
- fai commit e push, poi riparti dal passo 1.

## Mail del mattino

7. **Riepilogo.** Esegui `node scripts/regia/mail.mjs $S/out`: scrive `$S/out/mail.html` e `$S/out/mail.txt` e stampa l'oggetto.
   - Inviala con Gmail `send_message` all'indirizzo scritto nel prompt dell'attività programmata (non lo teniamo nel repository, che è pubblico): `subject` è l'oggetto stampato, `htmlBody` il contenuto di `mail.html`, `body` quello di `mail.txt`.
   - Una sola mail al giorno: se nella stessa giornata la regia viene aggiornata di nuovo, non rimandarla.
   - La mail contiene solo numeri e titoli, mai i testi dei messaggi.
   - Se Gmail non è disponibile, scrivilo nella riga finale.
