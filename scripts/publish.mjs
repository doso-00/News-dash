// Saves an edition written by hand or by a Claude Code session (no API key needed).
//
// Usage: node scripts/publish.mjs bozza.json [--date YYYY-MM-DD] [--extras-only]
// bozza.json has the same shape the generator produces: { headline, cards: [...], extras: [...] }.
// With --extras-only the file is { extras: [...] } and is merged into the edition already saved.

import fs from "node:fs";
import { Edition, checkEdition } from "./schema.mjs";
import { loadDay, romeDate, saveEdition } from "./store.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && a !== args[args.indexOf("--date") + 1]);
const date = args.includes("--date") ? args[args.indexOf("--date") + 1] : romeDate();
if (!file) {
  console.error("Uso: node scripts/publish.mjs bozza.json [--date AAAA-MM-GG]");
  process.exit(1);
}

let draft;
try {
  draft = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (err) {
  console.error(`Non riesco a leggere ${file}: ${err.message}`);
  process.exit(1);
}

if (args.includes("--extras-only")) {
  const day = loadDay(date);
  if (!day) {
    console.error(`Non c'è ancora un'edizione del ${date}: pubblicala prima, poi aggiungi le schede su misura.`);
    process.exit(1);
  }
  const incoming = draft.extras ?? [];
  const key = (x) => `${x.topic}/${x.kind}`;
  const replaced = new Set(incoming.map(key));
  draft = { headline: day.headline, cards: day.cards, extras: [...(day.extras ?? []).filter((x) => !replaced.has(key(x))), ...incoming] };
}

const parsed = Edition.safeParse(draft);
const problems = parsed.success ? checkEdition(parsed.data) : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
if (problems.length) {
  console.error(`Bozza non valida, correggi e riprova:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

const issue = saveEdition(date, parsed.data);
console.log(`Edizione n.${issue.number} del ${date} salvata.`);
