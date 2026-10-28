# Taccuino della redazione

Appunti per scrivere l'edizione del giorno senza dover ricostruire il contesto. Si legge **prima** di iniziare e si aggiorna **dopo** aver pubblicato.

## Dove e come

- Repository: `doso-00/News-dash`, branch `claude/personal-news-dashboard-f1mny6` (predefinito). Cartella locale: `/home/user/News-dash`.
- Procedura completa e stile di scrittura: `REDAZIONE.md`. Struttura dei dati e controlli: `scripts/schema.mjs`.
- Pubblicazione: `node scripts/publish.mjs <bozza.json> --date <AAAA-MM-GG>`, poi `node scripts/validate.mjs`, commit `Edizione del <data>` e push. Il push avvia da solo il deploy su GitHub Pages.
- App online: https://doso-00.github.io/News-dash/
- Attività programmata attiva: `trig_0164dUcat7EQX2ZHKsXt4Ymt`, ogni giorno alle 6:14 ora italiana, in questa sessione.
- Attività vecchia `trig_01Pxsx1Qh6CEMQaZQTzDm9TJ` disattivata: le sessioni nuove non hanno i permessi di push (errore 403).
- Utenti: `backend.js` usa Supabase se `config/backend.json` è compilato, altrimenti salva i profili sul dispositivo. Database collegato: progetto `vhzigfqjqcilooodnhms`. Profilo del proprietario: `@doso` (Riccardo Manfredonia), interessi preimpostati in `config/presets.json`. Per creare un profilo senza toccarne uno esistente: workflow "Crea profilo". Schema in `supabase/schema.sql`. La redazione quotidiana non tocca mai questi file.

- Schede su misura: ogni scheda principale dichiara `interests`; chi non ne condivide nessuno vede al suo posto una scheda `extras` scritta per un suo interesse (logica in `personalize()` di `app.js`). Gli interessi arrivano da `data/interests.json` (workflow "Esporta interessi", ogni notte). Procedura in `REDAZIONE.md`, sezione 5; `node scripts/plan.mjs` dice per quali interessi scrivere.

- Discussione per notizia: tabella `messages` e funzioni in `supabase/chat.sql` (da incollare a mano nel SQL Editor; poi workflow "Verifica chat"). Stanza = id della scheda; membri = chi ha l'id in `stats.cards`. Messaggi tenuti 30 giorni (il workflow notturno chiama `purge_old_messages`). La redazione non scrive mai messaggi.

- Regia (dashboard privata del proprietario con utenti, notizie, chat e consumo di Claude): dopo il push dell'edizione si aggiorna seguendo `scripts/regia/README.md`. I suoi dati non vanno mai nel repository.

## Lezioni imparate

- Il push funziona solo dalla sessione che ha il repository tra le fonti. Una sessione nuova può clonare, ma non pubblicare.
- WebFetch non raggiunge molte testate (errore DNS): per le notizie usa WebSearch in modalità `extended`.
- Le rassegne online a volte riportano cifre diverse: indica la discordanza nel testo invece di sceglierne una a caso.
- Non usare `pkill -f <nome>` in un comando che contiene lo stesso nome: uccide anche la shell e salta i comandi successivi.
- Controlla che `data/latest.json` punti alla data di oggi prima del commit.
- Gli `argv` degli script con opzioni facoltative: se cerchi il nome del file con `indexOf` di un'opzione assente, ottieni -1 e scarti il primo argomento. Controlla sempre `>= 0`.
- Le notizie di settore (cultura, viaggi) del giorno stesso sono rare: va bene una novità della settimana, con le date verificate. Se le fonti non concordano (es. scioperi), dillo nel testo.
- Se la scheda `mondo` di ieri anticipava un evento (voto, riunione), oggi va riportato l'esito: cerca prima i risultati, poi scrivi.
- Questa sessione non raggiunge supabase.co (rete bloccata). Per verificare il database usa il workflow "Verifica database" (`.github/workflows/check-db.yml`), che fa solo controlli in lettura, e leggine i log.

## Rotazione degli argomenti

Aree del profilo in `config/profile.json`. Non ripetere un'area di Sapere o Routine prima di averle usate tutte, se possibile.

| Data | Sapere (area) | Routine (area) |
|---|---|---|
| 2026-10-23 | Regola del 72 (economia e finanza personale) | Blocco di lavoro profondo (concentrazione) |
| 2026-10-24 | Regressione verso la media (statistica) | Camminata dopo i pasti (movimento) |
| 2026-10-25 | Bias di conferma (psicologia e bias cognitivi) | Sveglia fissa dopo il cambio dell'ora (sonno) |
| 2026-10-26 | Effetto ancoraggio (comunicazione e negoziazione) | Pianificare i pasti (alimentazione) |
| 2026-10-27 | Paradosso di Simpson (programmazione e dati) | Domande di approfondimento (relazioni) |
| 2026-10-28 | Caffeina e adenosina (salute e fisiologia) | Richiamo attivo (apprendimento) |

Prossime aree da coprire per Sapere: storia e geopolitica, scienza e tecnologia, filosofia pratica, produttività.
Prossime aree per Routine: mindset, gestione dello stress.

## Schede su misura scritte

| Data | Interessi coperti |
|---|---|
| 2026-10-24 | cinema, cucina, cultura (profilo con interessi che le schede principali non coprono) |
| 2026-10-25 | cinema, cucina, cultura, viaggi (terzo profilo iscritto; viaggi per chi non ha Sapere tra i suoi interessi) |
| 2026-10-26 | cinema, cultura, startup, viaggi (cucina coperta dalla scheda principale di routine) |
| 2026-10-27 | cucina, cinema, cultura, produttività, viaggi (10 schede: il terzo profilo e un profilo senza produttività tra le schede principali) |
| 2026-10-28 | cinema, cucina, cultura (6 schede: solo il terzo profilo è fuori dalle principali) |

## Registro delle edizioni

| Data | N. | Note |
|---|---|---|
| 2026-10-23 | 1 | Scritta a mano; riscritta nel formato a sezioni |
| 2026-10-24 | 2 | La sessione automatica non è riuscita a fare push; pubblicata da questa sessione |
| 2026-10-25 | 3 | Prima edizione della redazione automatica in questa sessione; 8 schede su misura |
| 2026-10-26 | 4 | Redazione automatica; 8 schede su misura. Il risultato del ballottaggio brasiliano era uscito nella notte: controllare sempre gli eventi annunciati il giorno prima |
| 2026-10-27 | 5 | Redazione automatica; 10 schede su misura. Notizia sull'IPO di Anthropic: dichiarato nel testo che Claude è un suo modello; cifre prese da stampa (WebFetch non raggiunge sec.gov) |
| 2026-10-28 | 6 | Redazione automatica; 6 schede su misura. Esito del voto israeliano ancora aperto all'ora della ricerca (solo exit poll e scrutinio parziale, discordanti): dichiarato nel testo. Fed: decisione di sera, scheda scritta come anteprima |
