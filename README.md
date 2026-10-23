# Cinque al Mattino

Ogni mattina cinque schede da leggere in 15 minuti:

| Scheda | Cosa contiene |
|---|---|
| **AI** | La novità più utile sull'intelligenza artificiale, con un prompt o mini-progetto da provare con Claude |
| **Finanza** | Il fatto di mercato del giorno spiegato insieme al concetto che lo rende comprensibile |
| **Mondo** | Il fatto politico o internazionale più importante, con il contesto |
| **Sapere** | Una conoscenza di base che ti rende più competente (argomenti a rotazione, mai ripetuti) |
| **Routine** | Un metodo pratico, basato su evidenze, con una checklist da spuntare |

Ogni scheda ha punti chiave, "perché ti riguarda", un'azione da fare oggi, glossario, approfondimenti e fonti. Poi c'è la parte di verifica:

- **"Non ho capito"** mostra una spiegazione semplice con un'analogia e ti permette di fare domande a Claude.
- **Quiz** di 10 domande (2 per tema) con spiegazione di ogni risposta.
- **Ripasso a intervalli**: le domande sbagliate tornano dopo 1, 3 e 7 giorni.
- **Verifica della comprensione**: rispondi con parole tue a una domanda aperta e Claude ti dice cosa hai capito e cosa approfondire.
- **Progressi**: giorni di fila, accuratezza per tema, grafico dei quiz, tema da rinforzare.
- **Archivio** di tutte le edizioni e delle schede salvate, **lettura ad alta voce**, tema chiaro/scuro.

È una PWA: si installa sul telefono come un'app e funziona anche offline.

## Come funziona

```
GitHub Actions (ogni mattina alle 05:41 UTC)
  └─ scripts/generate.mjs
       1. Claude + ricerca web: raccoglie le notizie delle ultime 24-48 ore
       2. Claude + output strutturato: scrive le 5 schede con quiz
       3. salva data/days/AAAA-MM-GG.json, data/latest.json, data/index.json
  └─ commit + pubblicazione su GitHub Pages
App (index.html + app.js) ── legge data/latest.json
```

## Attivazione (una volta sola, 5 minuti)

1. **Chiave API**: crea una chiave su [platform.claude.com](https://platform.claude.com/settings/keys) e aggiungila al repository in *Settings → Secrets and variables → Actions → New repository secret* con il nome `ANTHROPIC_API_KEY`.
2. **GitHub Pages**: in *Settings → Pages*, alla voce *Source* scegli **GitHub Actions**.
3. **Primo avvio**: in *Actions → Edizione quotidiana → Run workflow*. Da quel momento parte da solo ogni mattina.
4. **Installa l'app** aprendo `https://doso-00.github.io/News-dash/` dal telefono:
   - iPhone (Safari): *Condividi → Aggiungi alla schermata Home*
   - Android (Chrome): menu *⋮ → Installa app*

La pianificazione di GitHub parte solo dal branch predefinito del repository: se sposti il lavoro su `main`, impostalo come predefinito.

### Chat con Claude dentro l'app (facoltativa)

In *Progressi → Impostazioni* puoi incollare una chiave API: le domande e il feedback sulle tue risposte arrivano direttamente nell'app. La chiave resta solo sul tuo dispositivo. Senza chiave, i pulsanti "Apri in Claude" e "Copia domanda" portano la domanda, già contestualizzata, nell'app di Claude.

## Personalizzazione

Modifica `config/profile.json`: lavoro, obiettivi, interessi finanziari, aree di "Sapere" e "Routine", tono. Il generatore lo legge ogni mattina.

## Costi

Il generatore usa Claude Opus 5.5 con ricerca web (fino a 15 ricerche al giorno). Indicativamente si parla di circa un dollaro al giorno; controlla il consumo reale nella console di Claude dopo i primi giorni. Per spendere meno, cambia `MODEL` in `scripts/generate.mjs` in `claude-sonnet-5-5`.

## Sviluppo locale

```bash
npm ci
npm run serve                                    # apre l'app su http://localhost:8080
ANTHROPIC_API_KEY=... npm run generate           # genera l'edizione di oggi
ANTHROPIC_API_KEY=... node scripts/generate.mjs --force   # la rigenera
npm run validate                                 # controlla tutti i file in data/
npm run build:sdk                                # ricostruisce vendor/anthropic-sdk.mjs
```
