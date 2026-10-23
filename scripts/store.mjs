// Reading and writing editions in data/, shared by generate.mjs and publish.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES } from "./schema.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const DAYS = path.join(DATA, "days");

export function romeDate(d = new Date()) {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(d);
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

export const editionExists = (date) => fs.existsSync(path.join(DAYS, `${date}.json`));

// Titles from the last 30 editions, so sapere/routine never repeat a topic.
export function recentHistory(date) {
  const index = readJson(path.join(DATA, "index.json"), { days: [] });
  return index.days
    .filter((d) => d.date !== date)
    .slice(0, 30)
    .map((d) => `${d.date}: ${d.cards.map((c) => `[${c.category}] ${c.title}`).join(" | ")}`)
    .join("\n");
}

// Writes the day file and updates index.json and latest.json. `edition` must already be validated.
export function saveEdition(date, edition) {
  const index = readJson(path.join(DATA, "index.json"), { days: [] });
  const issue = {
    date,
    number: index.days.find((d) => d.date === date)?.number ?? index.days.length + 1,
    generatedAt: new Date().toISOString(),
    headline: edition.headline,
    cards: edition.cards.map((card) => ({
      ...card,
      id: `${date}-${card.category}`,
      label: CATEGORIES.find((c) => c.id === card.category).label,
    })),
  };

  writeJson(path.join(DAYS, `${date}.json`), issue);
  index.days = [
    { date, number: issue.number, headline: issue.headline, cards: issue.cards.map(({ category, title }) => ({ category, title })) },
    ...index.days.filter((d) => d.date !== date),
  ].sort((a, b) => b.date.localeCompare(a.date));
  writeJson(path.join(DATA, "index.json"), index);
  if (index.days[0].date === date) writeJson(path.join(DATA, "latest.json"), issue);
  return issue;
}
