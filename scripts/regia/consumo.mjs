// Builds the Claude usage rows of the owner's control dashboard from this session's transcript.
//
//   node scripts/regia/consumo.mjs <out.json> [--total <usd>]
//
// One row per day, activity and model: "redazione" for the turns started by the daily scheduled
// task, "sviluppo" for everything else (building the app, answering questions). Costs are at list
// price, as Claude Code reports them. --total is the session total from get_session: whatever the
// transcript doesn't show (the small model behind web searches, mostly) goes in one "altro" row.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// $ per million tokens: input, output, cache read, cache write. Haiku also pays $0.01 per search.
const PRICES = {
  "claude-opus-5-5": [4, 20, 0.2, 8],
  "claude-sonnet-5-5": [2, 10, 0.1, 4],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.2],
};
const MODEL_LABEL = { "claude-opus-5-5": "Opus", "claude-sonnet-5-5": "Sonnet", "claude-haiku-5-5": "Haiku" };
const DAILY_PROMPT = "Edizione quotidiana di Cinque al Mattino";

// Runs that happened outside this session, kept by hand. The 24/10 one is the old scheduled task
// that ran in a session of its own (it could write but not push).
const OUTSIDE = [{ day: "2026-10-24", attivita: "redazione", modello: "Haiku e Sonnet", costo: 0.64, nota: "sessione automatica separata" }];

const args = process.argv.slice(2);
const out = args[0];
const totalAt = args.indexOf("--total");
const total = totalAt >= 0 ? Number(args[totalAt + 1]) : null;
if (!out) {
  console.error("uso: node scripts/regia/consumo.mjs <out.json> [--total <usd>]");
  process.exit(1);
}

// The session writes its transcript under the project of its working directory: when the
// directory changes, a new file starts, so every project folder is read and the calls are
// counted once across files.
const root = path.join(os.homedir(), ".claude/projects");
const files = fs
  .readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => fs.readdirSync(path.join(root, d.name)).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(root, d.name, f)));
const seen = new Set();
const romeDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(iso));
const textOf = (content) => (typeof content === "string" ? content : (content ?? []).map((c) => c.text ?? "").join(" "));

const rows = new Map();
function add(day, attivita, model, u, cost) {
  const modello = MODEL_LABEL[model] ?? model;
  const key = `${day}|${attivita}|${modello}`;
  const r = rows.get(key) ?? { day, attivita, modello, costo: 0, chiamate: 0, input: 0, output: 0, cache_lette: 0, cache_scritte: 0 };
  r.costo += cost;
  r.chiamate += 1;
  r.input += u.input_tokens ?? 0;
  r.output += u.output_tokens ?? 0;
  r.cache_lette += u.cache_read_input_tokens ?? 0;
  r.cache_scritte += u.cache_creation_input_tokens ?? 0;
  rows.set(key, r);
}

let counted = 0;
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  let attivita = "sviluppo";
  for (const line of lines) {
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    // A person's message starts development work. The daily task arrives either as the turn's
    // own prompt or as a scheduled-trigger notification read with ReadNotifications: from there on
    // everything is "redazione" until the next message from a person. Notifications of background
    // work keep the activity of the turn that started that work.
    if (o.type === "user") {
      const text = textOf(o.message?.content);
      const content = typeof o.message?.content === "string" ? o.message.content : JSON.stringify(o.message?.content ?? "");
      if (o.origin?.kind === "human") attivita = text.trimStart().startsWith(DAILY_PROMPT) ? "redazione" : "sviluppo";
      else if (o.origin && o.origin.kind !== "task-notification") attivita = text.trimStart().startsWith(DAILY_PROMPT) ? "redazione" : "sviluppo";
      else if (content.includes("origin: scheduled trigger") && content.includes(DAILY_PROMPT)) attivita = "redazione";
      // the wake-up notice that precedes it: its first call re-reads the whole context
      else if (content.includes("queued-remote-notifications") && content.includes("scheduled trigger")) attivita = "redazione";
    }
    if (o.type !== "assistant" || !o.message?.usage || o.isSidechain) continue;
    const id = o.message.id ?? o.uuid;
    if (seen.has(id)) continue; // one streamed message is written in several lines
    seen.add(id);
    const p = PRICES[o.message.model];
    if (!p) continue;
    const u = o.message.usage;
    const cost =
      ((u.input_tokens ?? 0) * p[0] + (u.output_tokens ?? 0) * p[1] + (u.cache_read_input_tokens ?? 0) * p[2] + (u.cache_creation_input_tokens ?? 0) * p[3]) /
      1e6;
    add(romeDay(o.timestamp), attivita, o.message.model, u, cost);
    counted += cost;
  }
}

const list = [...rows.values()].map((r) => ({ ...r, nota: "" }));
for (const x of OUTSIDE) list.push({ chiamate: null, input: null, output: null, cache_lette: null, cache_scritte: null, ...x });
if (total != null && total - counted > 0.005) {
  list.push({
    day: romeDay(new Date().toISOString()),
    attivita: "altro",
    modello: "Haiku e altro",
    costo: total - counted,
    chiamate: null,
    input: null,
    output: null,
    cache_lette: null,
    cache_scritte: null,
    nota: "differenza tra il totale della sessione e le chiamate del registro (ricerche web)",
  });
}
for (const r of list) r.costo = Math.round(r.costo * 10000) / 10000;
list.sort((a, b) => a.day.localeCompare(b.day) || a.attivita.localeCompare(b.attivita) || a.modello.localeCompare(b.modello));
fs.writeFileSync(out, JSON.stringify(list, null, 1) + "\n");
console.log(`${list.length} righe, ${counted.toFixed(2)} $ dal registro${total != null ? `, ${total.toFixed(2)} $ totale sessione` : ""}`);
