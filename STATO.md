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

## Lezioni imparate

- Il push funziona solo dalla sessione che ha il repository tra le fonti. Una sessione nuova può clonare, ma non pubblicare.
- WebFetch non raggiunge molte testate (errore DNS): per le notizie usa WebSearch in modalità `extended`.
- Le rassegne online a volte riportano cifre diverse: indica la discordanza nel testo invece di sceglierne una a caso.
- Non usare `pkill -f <nome>` in un comando che contiene lo stesso nome: uccide anche la shell e salta i comandi successivi.
- Controlla che `data/latest.json` punti alla data di oggi prima del commit.
- Gli `argv` degli script con opzioni facoltative: se cerchi il nome del file con `indexOf` di un'opzione assente, ottieni -1 e scarti il primo argomento. Controlla sempre `>= 0`.
- Questa sessione non raggiunge supabase.co (rete bloccata). Per verificare il database usa il workflow "Verifica database" (`.github/workflows/check-db.yml`), che fa solo controlli in lettura, e leggine i log.

## Rotazione degli argomenti

Aree del profilo in `config/profile.json`. Non ripetere un'area di Sapere o Routine prima di averle usate tutte, se possibile.

| Data | Sapere (area) | Routine (area) |
|---|---|---|
| 2026-10-23 | Regola del 72 (economia e finanza personale) | Blocco di lavoro profondo (concentrazione) |
| 2026-10-24 | Regressione verso la media (statistica) | Camminata dopo i pasti (movimento) |

Prossime aree da coprire per Sapere: psicologia e bias cognitivi, comunicazione e negoziazione, storia e geopolitica, scienza e tecnologia, programmazione e dati, filosofia pratica, produttività, salute e fisiologia.
Prossime aree per Routine: sonno, alimentazione, relazioni, mindset, apprendimento, gestione dello stress.

## Schede su misura scritte

| Data | Interessi coperti |
|---|---|
| 2026-10-24 | cinema, cucina, cultura (profilo con interessi che le schede principali non coprono) |

## Registro delle edizioni

| Data | N. | Note |
|---|---|---|
| 2026-10-23 | 1 | Scritta a mano; riscritta nel formato a sezioni |
| 2026-10-24 | 2 | La sessione automatica non è riuscita a fare push; pubblicata da questa sessione |
