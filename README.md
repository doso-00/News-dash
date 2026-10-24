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
Attività programmata di Claude Code (ogni mattina verso le 6:15, ora italiana)
  └─ segue REDAZIONE.md: cerca le notizie sul web, scrive le 5 schede con i quiz
  └─ node scripts/publish.mjs → data/days/AAAA-MM-GG.json, data/latest.json, data/index.json
  └─ git push → GitHub Actions pubblica l'app su GitHub Pages
App (index.html + app.js) ── legge data/latest.json
```

Non serve nessuna chiave API: l'attività usa il tuo abbonamento Claude e consuma una parte dei tuoi limiti di utilizzo. La puoi vedere, mettere in pausa o cancellare tra le attività programmate di Claude Code.

## Attivazione (una volta sola)

1. **GitHub Pages**: in *Settings → Pages* (`https://github.com/doso-00/News-dash/settings/pages`), alla voce *Source* scegli **GitHub Actions**.
2. **Installa l'app** aprendo `https://doso-00.github.io/News-dash/` dal telefono:
   - iPhone (Safari): *Condividi → Aggiungi alla schermata Home*
   - Android (Chrome): menu *⋮ → Installa app*

### Chat con Claude dentro l'app (facoltativa)

Senza configurare nulla, i pulsanti "Apri in Claude" e "Copia domanda" portano la domanda, già contestualizzata, nell'app di Claude. Se un giorno vuoi le risposte direttamente dentro l'app, incolla una chiave API in *Progressi → Impostazioni*: resta solo sul tuo dispositivo, ma le API si pagano a consumo.

### Alternativa con chiave API

`scripts/generate.mjs` fa lo stesso lavoro tramite l'API di Claude. Per usarlo aggiungi il secret `ANTHROPIC_API_KEY` al repository e avvia a mano *Actions → Edizione quotidiana → Run workflow* (costo indicativo: circa un dollaro per edizione).

## Utenti, punteggi e amici

All'apertura l'app chiede di entrare: la prima volta con nome, cognome e username, poi basta lo username. Ognuno legge le stesse notizie ma ha i propri progressi (schede lette, quiz, routine). In *Progressi* c'è la classifica con gli amici: cerchi per nome o username, tocchi **Confronta** e vedi il confronto tema per tema.

Al primo accesso ognuno sceglie almeno 3 **interessi** tra 22 temi (modificabili in *Progressi*): nel confronto con un amico compaiono quelli in comune. Se sul telefono ci sono progressi di un altro profilo o di prima dei profili, l'app propone di spostarli nel profilo appena aperto.

**Punti:** 10 per scheda letta, 5 per risposta giusta, 20 per routine completata.

Finché `config/backend.json` è vuoto l'app funziona in **modalità locale**: i profili restano sul dispositivo. Per condividerli tra telefoni diversi serve un database Supabase gratuito:

1. Crea un account su [supabase.com](https://supabase.com) e un nuovo progetto (regione consigliata: Europa).
2. Apri *SQL Editor → New query*, incolla il contenuto di `supabase/schema.sql` e premi **Run**.
3. In *Project Settings → API Keys* copia il **Project URL** e la **publishable key** (inizia con `sb_publishable_`).
4. Inseriscili in `config/backend.json`:
   ```json
   { "supabaseUrl": "https://xxxx.supabase.co", "supabaseKey": "sb_publishable_..." }
   ```

La chiave publishable è pensata per stare in un'app pubblica. Poiché si entra solo con lo username, chiunque abbia il link può vedere profili e punteggi e potrebbe entrare con lo username di un altro: va bene tra amici, non per dati riservati. La chiave API di Claude e le risposte scritte alle domande di verifica restano sempre solo sul dispositivo.

## Personalizzazione

Modifica `config/profile.json`: lavoro, obiettivi, interessi finanziari, aree di "Sapere" e "Routine", tono. Il generatore lo legge ogni mattina.

## Sviluppo locale

```bash
npm ci
npm run serve                                    # apre l'app su http://localhost:8080
node scripts/publish.mjs bozza.json              # salva un'edizione scritta a mano o da Claude Code
ANTHROPIC_API_KEY=... npm run generate           # genera l'edizione di oggi via API
ANTHROPIC_API_KEY=... node scripts/generate.mjs --force   # la rigenera
npm run validate                                 # controlla tutti i file in data/
npm run build:sdk                                # ricostruisce vendor/anthropic-sdk.mjs
```
