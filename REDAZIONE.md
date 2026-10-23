# Istruzioni per la redazione quotidiana

Queste istruzioni le esegue ogni mattina una sessione di Claude Code programmata. Non serve una chiave API: la sessione usa i propri strumenti di ricerca web.

## 1. Prepara il repository

- Lavora nel repository `doso-00/News-dash`, sul branch predefinito (`claude/personal-news-dashboard-f1mny6`), aggiornato con `git pull`.
- Esegui `npm ci`.
- Calcola la data di oggi in Italia: `TZ=Europe/Rome date +%F`.
- Se `data/days/<data>.json` esiste già, fermati: l'edizione di oggi è già pubblicata.

## 2. Leggi il contesto

- `config/profile.json`: chi è il lettore, obiettivi, aree di Sapere e Routine, tono.
- `data/index.json`: titoli delle edizioni recenti. Non ripetere argomenti di Sapere e Routine degli ultimi 30 giorni, e non riproporre la stessa notizia.
- `data/days/2026-10-23.json`: esempio di edizione completa, per stile, lunghezza e forma.
- `scripts/schema.mjs`: la struttura esatta e le regole di validazione.

## 3. Fai la ricerca

Usa la ricerca web per le notizie delle ultime 24-48 ore:

- **ai**: la novità più utile e concreta sull'intelligenza artificiale, con un'idea pratica da provare o costruire con Claude.
- **finanza**: il fatto di mercato o economico più rilevante, spiegato insieme al concetto finanziario che lo rende comprensibile.
- **mondo**: il fatto politico o internazionale più importante, con il contesto necessario a capirlo.
- **sapere**: una conoscenza di base che rende più competenti, a rotazione tra le aree del profilo.
- **routine**: un metodo o una routine pratica e sostenibile, basata su evidenze, con 3-5 passi spuntabili.

Preferisci fonti primarie e testate affidabili. Usa solo fatti che hai trovato nelle fonti: non inventare numeri, date o citazioni. Se le fonti non concordano o una cifra è incerta, dillo nel testo.

## 4. Scrivi la bozza

Scrivi `/tmp/bozza.json` in italiano, con questa forma:

```
{
  "headline": "frase di apertura del giorno, max 120 caratteri",
  "cards": [ 5 schede nell'ordine ai, finanza, mondo, sapere, routine ]
}
```

Ogni scheda ha: `category`, `title`, `subtitle`, `summary` (2 frasi), `stat` (`{value, label}`: il numero simbolo della notizia, corto, es. "-2,6%" o "90 min"; `null` se non c'è un numero significativo), `sections` (4-5 `{heading, text}`), `keyPoints` (3, max 15 parole), `whyItMatters`, `actionToday` (concreto, 15 minuti; per ai un prompt o mini-progetto con Claude), `checklist` (solo routine, altrimenti `[]`), `eli5` (analogia quotidiana), `deepDive` (2 approfondimenti `{title, text}`), `glossary` (2-3 `{term, meaning}`), `sources` (`{title, url}` realmente consultate; obbligatorie per ai, finanza, mondo), `readingMinutes`, `quiz` (2 domande con 4 opzioni, `answer` = indice 0-3 della corretta, `explanation`), `reflection` (domanda aperta).

### Stile di scrittura

Il testo si legge sul telefono, deve scorrere come un racconto:

- Le `sections` raccontano la storia in ordine: cosa è successo, perché, conseguenze, contesto. Ogni `heading` è un titoletto concreto di massimo 6 parole che anticipa il contenuto ("La scintilla: Meta", non "Analisi").
- Ogni `text` ha 1-3 frasi brevi. Una sola idea per sezione.
- Evidenzia con `**doppi asterischi**` il dato o la frase chiave: 1-2 per sezione, mai frasi intere lunghe. Puoi farlo anche in `summary`, `keyPoints`, `whyItMatters` e `actionToday`.
- Usa nel testo i termini del `glossary` con la stessa grafia: nell'app diventano parole toccabili con la definizione.
- Frasi attive e dirette, numeri concreti, niente giri di parole.

Le domande del quiz verificano la comprensione, non la memoria di dettagli irrilevanti. Le opzioni sbagliate devono essere plausibili.

## 5. Pubblica

```bash
node scripts/publish.mjs /tmp/bozza.json
node scripts/validate.mjs
git add data
git commit -m "Edizione del $(TZ=Europe/Rome date +%F)"
git push origin HEAD
```

Se `publish.mjs` segnala problemi, correggi la bozza e riprova. Modifica solo i file in `data/`. Non aprire pull request. Il push avvia da solo la pubblicazione dell'app su GitHub Pages.
