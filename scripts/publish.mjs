// Saves an edition written by hand or by a Claude Code session (no API key needed).
//
// Usage: node scripts/publish.mjs bozza.json [--date YYYY-MM-DD]
// bozza.json has the same shape the generator produces: { headline, cards: [...] }.

import fs from "node:fs";
import { Edition, checkEdition } from "./schema.mjs";
import { romeDate, saveEdition } from "./store.mjs";

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

const parsed = Edition.safeParse(draft);
const problems = parsed.success ? checkEdition(parsed.data) : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
if (problems.length) {
  console.error(`Bozza non valida, correggi e riprova:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

const issue = saveEdition(date, parsed.data);
console.log(`Edizione n.${issue.number} del ${date} salvata.`);
