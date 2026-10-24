# Taccuino della redazione

Appunti per scrivere l'edizione del giorno senza dover ricostruire il contesto. Si legge **prima** di iniziare e si aggiorna **dopo** aver pubblicato.

## Dove e come

- Repository: `doso-00/News-dash`, branch `claude/personal-news-dashboard-f1mny6` (predefinito). Cartella locale: `/home/user/News-dash`.
- Procedura completa e stile di scrittura: `REDAZIONE.md`. Struttura dei dati e controlli: `scripts/schema.mjs`.
- Pubblicazione: `node scripts/publish.mjs <bozza.json> --date <AAAA-MM-GG>`, poi `node scripts/validate.mjs`, commit `Edizione del <data>` e push. Il push avvia da solo il deploy su GitHub Pages.
- App online: https://doso-00.github.io/News-dash/
- Attività programmata attiva: `trig_0164dUcat7EQX2ZHKsXt4Ymt`, ogni giorno alle 6:14 ora italiana, in questa sessione.
- Attività vecchia `trig_01Pxsx1Qh6CEMQaZQTzDm9TJ` disattivata: le sessioni nuove non hanno i permessi di push (errore 403).

## Lezioni imparate

- Il push funziona solo dalla sessione che ha il repository tra le fonti. Una sessione nuova può clonare, ma non pubblicare.
- WebFetch non raggiunge molte testate (errore DNS): per le notizie usa WebSearch in modalità `extended`.
- Le rassegne online a volte riportano cifre diverse: indica la discordanza nel testo invece di sceglierne una a caso.
- Non usare `pkill -f <nome>` in un comando che contiene lo stesso nome: uccide anche la shell e salta i comandi successivi.
- Controlla che `data/latest.json` punti alla data di oggi prima del commit.

## Rotazione degli argomenti

Aree del profilo in `config/profile.json`. Non ripetere un'area di Sapere o Routine prima di averle usate tutte, se possibile.

| Data | Sapere (area) | Routine (area) |
|---|---|---|
| 2026-10-23 | Regola del 72 (economia e finanza personale) | Blocco di lavoro profondo (concentrazione) |
| 2026-10-24 | Regressione verso la media (statistica) | Camminata dopo i pasti (movimento) |

Prossime aree da coprire per Sapere: psicologia e bias cognitivi, comunicazione e negoziazione, storia e geopolitica, scienza e tecnologia, programmazione e dati, filosofia pratica, produttività, salute e fisiologia.
Prossime aree per Routine: sonno, alimentazione, relazioni, mindset, apprendimento, gestione dello stress.

## Registro delle edizioni

| Data | N. | Note |
|---|---|---|
| 2026-10-23 | 1 | Scritta a mano; riscritta nel formato a sezioni |
| 2026-10-24 | 2 | La sessione automatica non è riuscita a fare push; pubblicata da questa sessione |
