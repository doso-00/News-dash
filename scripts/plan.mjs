// Says which interests need a card written for them today.
//
// Usage: node scripts/plan.mjs bozza.json [--max 6]
//
// Reads data/interests.json (the interests of the people signed up, with no names) and the
// `interests` tags of the five main cards in the draft. A person whose interests match none
// of a main card's tags would see a different card in its place, so their interests need
// cards of their own. Prints the interests to cover, most-needed first, capped at --max.

import fs from "node:fs";
import path from "node:path";
import { INTEREST_LABEL } from "../interests.js";
import { ROOT, readJson } from "./store.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && a !== args[args.indexOf("--max") + 1]);
const max = args.includes("--max") ? Number(args[args.indexOf("--max") + 1]) : 6;
if (!file) {
  console.error("Uso: node scripts/plan.mjs bozza.json [--max 6]");
  process.exit(1);
}

const draft = JSON.parse(fs.readFileSync(file, "utf8"));
const cards = draft.cards ?? [];
const profiles = readJson(path.join(ROOT, "data", "interests.json"), { profiles: [] }).profiles;
const covered = new Set(cards.flatMap((c) => c.interests ?? []));

const needed = new Map(); // interest -> number of people who need it
let unserved = 0;
for (const mine of profiles) {
  const set = new Set(mine);
  const missing = cards.filter((c) => !(c.interests ?? []).some((i) => set.has(i))).length;
  if (!missing) continue;
  unserved++;
  // Interests the main cards don't speak to come first; up to three per person.
  const own = mine.filter((i) => !covered.has(i));
  const pick = (own.length ? own : mine).slice(0, 3);
  for (const i of pick) needed.set(i, (needed.get(i) ?? 0) + 1);
}

const ranked = [...needed].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const chosen = ranked.slice(0, max);

console.log(`Profili: ${profiles.length}. Con almeno una scheda principale fuori dai loro interessi: ${unserved}.`);
if (!chosen.length) {
  console.log("Nessuna scheda su misura necessaria oggi.");
} else {
  console.log(`Scrivi per ognuno di questi interessi una scheda "news" e una "spunto" (${chosen.length * 2} in tutto):`);
  for (const [id, n] of chosen) console.log(`  ${id.padEnd(13)} ${INTEREST_LABEL[id]} (${n} ${n === 1 ? "persona" : "persone"})`);
  if (ranked.length > chosen.length) {
    console.log(`Esclusi per il limite di ${max}: ${ranked.slice(max).map(([id]) => id).join(", ")} (oggi vedranno le schede principali).`);
  }
}
