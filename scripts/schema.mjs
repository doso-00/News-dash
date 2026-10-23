import * as z from "zod/v4";

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

export const Card = z.object({
  category: z.enum(CATEGORIES.map((c) => c.id)),
  title: z.string().describe("Titolo incisivo, max 90 caratteri"),
  subtitle: z.string().describe("Una riga che dice cosa si impara"),
  summary: z.string().describe("Sintesi in 2-3 frasi"),
  body: z.array(z.string()).describe("3-5 paragrafi di spiegazione"),
  keyPoints: z.array(z.string()).describe("3-4 punti chiave"),
  whyItMatters: z.string().describe("Perché conta per il lettore, in concreto"),
  actionToday: z.string().describe("Una cosa concreta da fare oggi (es. un prompt da provare con Claude)"),
  checklist: z
    .array(z.string())
    .describe("Solo per 'routine': 3-5 passi spuntabili. Per le altre categorie un array vuoto"),
  eli5: z.string().describe("Spiegazione semplicissima con un'analogia, per chi non ha capito"),
  deepDive: z.array(DeepDive).describe("2 approfondimenti"),
  glossary: z
    .array(z.object({ term: z.string(), meaning: z.string() }))
    .describe("2-3 termini tecnici spiegati"),
  sources: z.array(Source).describe("Fonti reali usate; vuoto solo per sapere/routine senza fonti"),
  readingMinutes: z.number().int(),
  quiz: z.array(QuizQuestion).describe("Esattamente 2 domande"),
  reflection: z.string().describe("Una domanda aperta per verificare la comprensione"),
});

export const Edition = z.object({
  headline: z.string().describe("Frase di apertura del giorno, max 120 caratteri"),
  cards: z.array(Card).describe("Esattamente 5 schede, una per categoria, nell'ordine ai, finanza, mondo, sapere, routine"),
});

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
    if (card.body.length < 2) problems.push(`${card.category}: corpo troppo corto`);
    if (["ai", "finanza", "mondo"].includes(card.category) && card.sources.length === 0)
      problems.push(`${card.category}: mancano le fonti`);
    if (card.category === "routine" && card.checklist.length === 0) problems.push("routine: manca la checklist");
  });
  return problems;
}
