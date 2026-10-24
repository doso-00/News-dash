# Regia: aggiornare la dashboard di controllo

La regia è una dashboard privata del proprietario: https://claude.ai/artifact/EWucDwXHFKLgoGdbBTshQw
I dati arrivano come file allegati e non entrano mai nel repository. Lavora nella cartella scratchpad della sessione (qui `$S`).

1. **Profili e messaggi.** Avvia il workflow `regia.yml` (strumento GitHub `actions_run_trigger`, `run_workflow`, ref `claude/personal-news-dashboard-f1mny6`).
   - Aspetta che finisca (`actions_list` → `list_workflow_runs`, poi `list_workflow_jobs`) e leggi il log del job con `get_job_logs` e `return_content: true`.
   - Copia in `$S/log.txt` le righe da `-----CHIAVE-----` a `-----FINE-----` (i timestamp all'inizio delle righe si possono lasciare).
   - Esegui `sh scripts/regia/decrypt.sh $S/log.txt $S/export.json`.
   - Cancella il log del run con `actions_run_trigger`, `delete_workflow_run_logs`.
2. **Consumo.** Esegui `node scripts/regia/consumo.mjs $S/consumo.json` e annota il totale "$ dal registro".
3. **Sessioni e limite.** Prendi i dati da `list_sessions` (`mine: true`) e da `get_session` senza id. Scrivi `$S/sessioni.json`:
   - `sessioni`: elenco di `{titolo, progetto, costo, creata, aggiornata}`; `progetto` vale "Cinque al Mattino" per questa sessione e per le redazioni automatiche, "Altri progetti" per il resto;
   - per questa sessione `costo` è il totale del passo 2, non quello di `get_session`;
   - `limiti`: `{stato, finestra, reset, letto, fuori_piano}` da `rate_limit_info`, con `reset` in ISO.
4. **File.** Esegui `node scripts/regia/build.mjs $S/export.json $S/consumo.json $S/sessioni.json $S/out`.
5. **Caricamento.** Carica ogni file di `$S/out` con lo strumento Artifact (`url` della regia, `asset: true`, un file per chiamata).
   - Leggi le versioni con ArtifactData `list` della collezione `datasets`.
   - Con un solo `batch` aggiorna `source.url`, `source.name` e `updated: {at, by: "Claude"}` dei dataset `consumo`, `utenti`, `attivita`, `notizie`, `messaggi`, `sessioni` e `limiti`, passando `if_version`.
   - Poi cancella gli allegati vecchi (Artifact `delete` con `url` e `path` = id): sono quelli che i dataset non citano più.

**Chiave privata.** Si trova in `/root/.config/cinque-regia/key.pem`, fuori dal repository. Se il container è stato ricreato e la chiave manca:
- generane una nuova: `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out key.pem`;
- scrivi la chiave pubblica in `config/regia.pub.pem` con `openssl pkey -in key.pem -pubout`;
- fai commit e push, poi riparti dal passo 1.
