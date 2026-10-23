// Validates every edition in data/days against the schema the generator uses.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Edition, checkEdition } from "./schema.mjs";

const DATA = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const days = fs.readdirSync(path.join(DATA, "days")).filter((f) => f.endsWith(".json"));
let failed = 0;

for (const file of days) {
  const issue = JSON.parse(fs.readFileSync(path.join(DATA, "days", file), "utf8"));
  const parsed = Edition.safeParse(issue);
  const problems = parsed.success ? checkEdition(parsed.data) : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
  if (`${issue.date}.json` !== file) problems.push(`la data ${issue.date} non corrisponde al nome del file`);
  if (problems.length) {
    failed++;
    console.error(`✗ ${file}\n  ${problems.join("\n  ")}`);
  } else {
    console.log(`✓ ${file}`);
  }
}

const index = JSON.parse(fs.readFileSync(path.join(DATA, "index.json"), "utf8"));
const latest = JSON.parse(fs.readFileSync(path.join(DATA, "latest.json"), "utf8"));
if (index.days[0]?.date !== latest.date) {
  failed++;
  console.error(`✗ latest.json (${latest.date}) non è l'edizione più recente dell'indice (${index.days[0]?.date})`);
}

process.exit(failed ? 1 : 0);
