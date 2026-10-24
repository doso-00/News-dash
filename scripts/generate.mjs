// Generates today's edition: researches the news with Claude + web search,
// then turns the notes into five structured cards with quizzes.
//
// Usage: ANTHROPIC_API_KEY=... node scripts/generate.mjs [--date YYYY-MM-DD] [--force]

import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { CATEGORIES, Edition, checkEdition } from "./schema.mjs";
import { INTEREST_IDS } from "../interests.js";
import { ROOT, editionExists, readJson, recentHistory, romeDate, saveEdition } from "./store.mjs";

const MODEL = "claude-opus-5-5";
const MAX_CONTINUATIONS = 5;

const args = process.argv.slice(2);
const force = args.includes("--force");
const dateArg = args.includes("--date") ? args[args.indexOf("--date") + 1] : null;
const date = dateArg ?? romeDate();

function textOf(message) {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function assertNotRefused(message, step) {
  if (message.stop_reason === "refusal") {
    const why = message.stop_details?.explanation ?? "nessun dettaglio";
    throw new Error(`${step}: richiesta rifiutata (${why})`);
  }
  if (message.stop_reason === "max_tokens") throw new Error(`${step}: risposta troncata (max_tokens)`);
}

const client = new Anthropic();
const profile = readJson(path.join(ROOT, "config", "profile.json"), {});

const SYSTEM = `Sei il redattore di una rassegna personale del mattino, scritta in italiano per una sola persona.
Profilo del lettore (JSON): ${JSON.stringify(profile)}
Ogni giorno prepari 5 schede: ${CATEGORIES.map((c) => `${c.id} = ${c.label}`).join("; ")}.
- ai: la novità più utile e concreta delle ultime 24-48 ore sull'intelligenza artificiale, con un'idea pratica da provare o costruire con Claude.
- finanza: il fatto di mercato o economico più rilevante, spiegato insieme al concetto finanziario che lo rende comprensibile.
- mondo: il fatto politico o internazionale più importante, con il contesto necessario a capirlo.
- sapere: una conoscenza di base che rende più competenti (ruota tra le aree del profilo, mai ripetere un argomento recente).
- routine: un metodo o una routine pratica e sostenibile, basata su evidenze, con passi spuntabili.
Regole: usa solo fatti verificati nelle fonti trovate, non inventare numeri, date o citazioni. Se una cifra è incerta, dillo. Tono: ${profile.tono ?? "chiaro e concreto"}.`;

async function research() {
  const history = recentHistory(date);
  const messages = [
    {
      role: "user",
      content: `Oggi è ${date}. Cerca sul web le notizie delle ultime 24-48 ore per le schede ai, finanza e mondo, e scegli l'argomento per sapere e routine.
Per ogni scheda scrivi appunti di ricerca dettagliati: fatti, numeri, date, chi è coinvolto, contesto, e gli URL delle fonti che hai letto.
Preferisci fonti primarie e testate affidabili. Per sapere e routine, se utile, cerca anche studi o fonti autorevoli.
Edizioni recenti da non ripetere:
${history || "(nessuna)"}`,
    },
  ];

  for (let i = 0; i <= MAX_CONTINUATIONS; i++) {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high" },
      system: SYSTEM,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 15 }],
      messages,
    });
    const message = await stream.finalMessage();
    assertNotRefused(message, "ricerca");
    if (message.stop_reason !== "pause_turn") {
      return messages
        .filter((m) => m.role === "assistant")
        .map((m) => textOf({ content: m.content }))
        .concat(textOf(message))
        .join("\n");
    }
    // The server-side search loop paused; send the turn back so it resumes.
    messages.push({ role: "assistant", content: message.content });
  }
  throw new Error("ricerca: troppe continuazioni (pause_turn)");
}

async function compose(notes, feedback) {
  // Streamed because the output is long; the JSON shape is enforced by the output format.
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(Edition) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Data: ${date}. Ecco gli appunti di ricerca:

<appunti>
${notes}
</appunti>

Trasformali nell'edizione di oggi: 5 schede nell'ordine ai, finanza, mondo, sapere, routine.
Ogni scheda ha 2 domande di quiz con 4 opzioni (una sola corretta, le altre plausibili) che verificano la comprensione, non la memoria di dettagli irrilevanti.
Il testo si legge sul telefono: "sections" racconta la storia in 4-5 tappe brevi (cosa è successo, perché, conseguenze, contesto), ognuna con un titoletto concreto e 1-3 frasi. Evidenzia con **doppi asterischi** 1-2 dati o frasi chiave per sezione. "stat" è il numero simbolo della notizia. Usa nel testo i termini del glossario con la stessa grafia.
Ogni scheda ha "interests": da 2 a 5 id, scelti solo tra ${INTEREST_IDS.join(", ")}, degli interessi a cui parla davvero. "extras" resta vuoto: le schede su misura le scrive la redazione quotidiana.
"eli5" spiega il concetto centrale con un'analogia quotidiana. "deepDive" va oltre la notizia. "actionToday" è concreto e fattibile in 15 minuti; per la scheda ai proponi un prompt o un mini-progetto da fare con Claude.
Le fonti devono essere URL presenti negli appunti.${feedback ? `\n\nLa bozza precedente aveva questi problemi, correggili: ${feedback}` : ""}`,
      },
    ],
  });
  const message = await stream.finalMessage();
  assertNotRefused(message, "composizione");
  return Edition.parse(JSON.parse(textOf(message)));
}

async function main() {
  if (editionExists(date) && !force) {
    console.log(`Edizione ${date} già presente, salto (usa --force per rigenerarla).`);
    return;
  }

  console.log(`Ricerca per ${date}...`);
  const notes = await research();

  let edition;
  let problems = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    console.log(attempt === 0 ? "Composizione..." : `Correzione: ${problems.join("; ")}`);
    try {
      edition = await compose(notes, attempt ? problems.join("; ") : null);
      problems = checkEdition(edition);
    } catch (err) {
      if (err instanceof Anthropic.AnthropicError) throw err;
      problems = [err.message];
    }
    if (problems.length === 0) break;
  }
  if (problems.length) throw new Error(`Edizione non valida: ${problems.join("; ")}`);

  const issue = saveEdition(date, edition);
  console.log(`Edizione n.${issue.number} del ${date} salvata.`);
}

main().catch((err) => {
  if (err instanceof Anthropic.AuthenticationError) console.error("Chiave API non valida: controlla il secret ANTHROPIC_API_KEY.");
  else if (err instanceof Anthropic.RateLimitError) console.error("Limite di richieste raggiunto, riprova più tardi.");
  else if (err instanceof Anthropic.APIError) console.error(`Errore API ${err.status}: ${err.message}`);
  else console.error(err.message ?? err);
  process.exit(1);
});
