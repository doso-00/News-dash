import * as z from "zod/v4";
import { EXTRA_KINDS, INTEREST_IDS, INTEREST_FAMILY } from "../interests.js";

// The five daily sections, in the order the app shows them.
export const CATEGORIES = [
  { id: "ai", label: "Intelligenza artificiale" },
  { id: "finanza", label: "Finanza" },
  { id: "mondo", label: "Mondo" },
  { id: "sapere", label: "Sapere" },
  { id: "routine", label: "Metodo & routine" },
];

const Source = z.object({
  title: z.string().describe("Nome della testata o titolo della pagina"),
  url: z.string().describe("URL completo della fonte"),
});

const QuizQuestion = z.object({
  q: z.string().describe("Domanda breve e precisa"),
  options: z.array(z.string()).describe("Esattamente 4 risposte possibili"),
  answer: z.number().int().describe("Indice (0-3) della risposta corretta"),
  explanation: z.string().describe("Perché è corretta, 1-2 frasi"),
});

const DeepDive = z.object({
  title: z.string(),
  text: z.string().describe("Un paragrafo che va oltre la notizia: contesto, storia, meccanismo"),
});

const Section = z.object({
  heading: z.string().describe("Titoletto breve e concreto, max 6 parole, che anticipa il contenuto"),
  text: z.string().describe("1-3 frasi brevi. Evidenzia con **doppi asterischi** la frase o il dato chiave (max 1-2 per sezione)"),
});

const Stat = z.object({
  value: z.string().describe("Il numero simbolo della notizia, corto: es. '-2,6%', '111 $', '72', '90 min'"),
  label: z.string().describe("Cosa misura, in poche parole"),
});

const cardFields = {
  title: z.string().describe("Titolo incisivo, max 90 caratteri"),
  subtitle: z.string().describe("Una riga che dice cosa si impara"),
  summary: z.string().describe("Sintesi in 2 frasi, la seconda può avere un **dato chiave** evidenziato"),
  stat: Stat.nullable().describe("Il numero del giorno per questa scheda, o null se non c'è un numero significativo"),
  sections: z.array(Section).describe("4-5 sezioni brevi che raccontano la storia in ordine: cosa è successo, perché, conseguenze, contesto"),
  keyPoints: z.array(z.string()).describe("3 punti chiave, max 15 parole ciascuno"),
  whyItMatters: z.string().describe("Perché conta per il lettore, in concreto"),
  actionToday: z.string().describe("Una cosa concreta da fare oggi (es. un prompt da provare con Claude)"),
  checklist: z
    .array(z.string())
    .describe("Solo per le routine e per gli spunti pratici: 3-5 passi spuntabili. Per le altre schede un array vuoto"),
  eli5: z.string().describe("Spiegazione semplicissima con un'analogia, per chi non ha capito"),
  deepDive: z.array(DeepDive).describe("2 approfondimenti"),
  glossary: z
    .array(z.object({ term: z.string(), meaning: z.string() }))
    .describe("2-3 termini tecnici spiegati"),
  sources: z.array(Source).describe("Fonti reali usate; vuoto solo per sapere/routine senza fonti"),
  readingMinutes: z.number().int(),
  quiz: z.array(QuizQuestion).describe("Esattamente 2 domande"),
  reflection: z.string().describe("Una domanda aperta per verificare la comprensione"),
};

export const Card = z.object({
  category: z.enum(CATEGORIES.map((c) => c.id)),
  interests: z
    .array(z.enum(INTEREST_IDS))
    .describe("Da 2 a 5 interessi a cui la scheda parla davvero. Chi non ne ha nessuno vede al suo posto una scheda su misura"),
  ...cardFields,
});

// A card written for one interest. The app shows it in place of a main card the reader's interests don't fit.
export const Extra = z.object({
  topic: z.enum(INTEREST_IDS),
  kind: z.enum(EXTRA_KINDS).describe("news = la novità di oggi in quel settore; spunto = qualcosa da imparare o provare"),
  ...cardFields,
});

export const Edition = z.object({
  headline: z.string().describe("Frase di apertura del giorno, max 120 caratteri"),
  cards: z.array(Card).describe("Esattamente 5 schede, una per categoria, nell'ordine ai, finanza, mondo, sapere, routine"),
  extras: z.array(Extra).optional().describe("Schede su misura per gli interessi che le schede principali non coprono"),
});

// Fields the app adds when an edition is saved.
export const extraCategory = (topic) => INTEREST_FAMILY[topic];

// Checks the model output beyond what the JSON schema can express.
export function checkEdition(edition) {
  const problems = [];
  const order = CATEGORIES.map((c) => c.id);
  if (edition.cards.length !== 5) problems.push(`servono 5 schede, trovate ${edition.cards.length}`);
  edition.cards.forEach((card, i) => {
    if (card.category !== order[i]) problems.push(`scheda ${i}: categoria ${card.category}, attesa ${order[i]}`);
    if (card.quiz.length < 2) problems.push(`${card.category}: servono almeno 2 domande`);
    card.quiz.forEach((q, j) => {
      if (q.options.length !== 4) problems.push(`${card.category} quiz ${j}: servono 4 opzioni`);
      if (q.answer < 0 || q.answer >= q.options.length) problems.push(`${card.category} quiz ${j}: indice risposta fuori range`);
    });
    if (card.sections.length < 3) problems.push(`${card.category}: servono almeno 3 sezioni`);
    if (["ai", "finanza", "mondo"].includes(card.category) && card.sources.length === 0)
      problems.push(`${card.category}: mancano le fonti`);
    if (card.category === "routine" && card.checklist.length === 0) problems.push("routine: manca la checklist");
    if (card.interests.length < 2) problems.push(`${card.category}: indica almeno 2 interessi`);
  });

  const seen = new Set();
  for (const x of edition.extras ?? []) {
    const name = `scheda su misura ${x.topic}/${x.kind}`;
    if (seen.has(`${x.topic}/${x.kind}`)) problems.push(`${name}: duplicata`);
    seen.add(`${x.topic}/${x.kind}`);
    if (x.sections.length < 3) problems.push(`${name}: servono almeno 3 sezioni`);
    if (x.quiz.length < 1) problems.push(`${name}: serve almeno 1 domanda`);
    x.quiz.forEach((q, j) => {
      if (q.options.length !== 4) problems.push(`${name} quiz ${j}: servono 4 opzioni`);
      if (q.answer < 0 || q.answer >= q.options.length) problems.push(`${name} quiz ${j}: indice risposta fuori range`);
    });
    if (x.kind === "news" && x.sources.length === 0) problems.push(`${name}: mancano le fonti`);
  }
  return problems;
}
