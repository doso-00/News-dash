// Builds the data files of the owner's control dashboard ("Regia").
//
//   node scripts/regia/build.mjs <export.json> <consumo.json> <sessioni.json> <limiti.json> <out dir>
//
// export.json   the decrypted output of the "Esporta regia" workflow (profiles and messages)
// consumo.json  the output of scripts/regia/consumo.mjs
// sessioni.json {sessioni: [{titolo, progetto, costo, creata, aggiornata}]} from list_sessions
// limiti.json   readings of the plan's usage limits, see README: {letture: [{letto, finestra,
//               usato, si_azzera}], extra: {in_uso, stato, motivo}}. New readings are added to
//               the history kept next to the private key.
//
// The files go to the dashboard as attachments: they never enter the repository.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ROOT, readJson } from "../store.mjs";
import { INTEREST_LABEL } from "../../interests.js";

const [exportFile, consumoFile, sessioniFile, limitiFile, outDir] = process.argv.slice(2);
if (!outDir) {
  console.error("uso: node scripts/regia/build.mjs <export.json> <consumo.json> <sessioni.json> <limiti.json> <out dir>");
  process.exit(1);
}
const exp = readJson(exportFile, null);
if (!exp) throw new Error(`${exportFile} non leggibile`);
const romeDay = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date(iso));

// ---- news: every main card and every card written for an interest ----
const index = readJson(path.join(ROOT, "data/index.json"), { days: [] });
const cards = [];
for (const { date } of index.days) {
  const day = readJson(path.join(ROOT, "data/days", `${date}.json`), null);
  if (!day) continue;
  for (const c of day.cards) cards.push({ c, day, tipo: "principale" });
  for (const c of day.extras ?? []) cards.push({ c, day, tipo: c.kind === "news" ? "su misura · notizia" : "su misura · spunto" });
}
const holders = (id) => exp.players.filter((p) => (p.stats?.cards ?? []).includes(id)).length;
const msgCount = (id) => exp.messages.filter((m) => m.card_id === id).length;
const notizie = cards.map(({ c, day, tipo }) => ({
  id: c.id,
  day: day.date,
  edizione: day.number,
  tipo,
  sezione: c.label,
  titolo: c.title,
  minuti: c.readingMinutes ?? null,
  fonti: (c.sources ?? []).length,
  persone: holders(c.id),
  messaggi: msgCount(c.id),
}));
const titleOf = Object.fromEntries(notizie.map((n) => [n.id, n.titolo]));

// ---- people ----
const utenti = exp.players.map((p) => {
  const s = p.stats ?? {};
  return {
    username: p.username,
    nome: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
    iscritto: romeDay(p.created_at),
    ultimo_uso: p.updated_at,
    punti: s.points ?? 0,
    lette: s.read ?? 0,
    quiz_giuste: s.quizRight ?? 0,
    quiz_totali: s.quizTotal ?? 0,
    routine: s.routineDays ?? 0,
    giorni_attivi: (s.activity ?? []).length,
    interessi: (s.interests ?? []).map((i) => INTEREST_LABEL[i] ?? i).join(", "),
    messaggi: exp.messages.filter((m) => m.username === p.username).length,
  };
});
const attivita = exp.players.flatMap((p) => (p.stats?.activity ?? []).map((day) => ({ day, username: p.username })));

// ---- discussion ----
const messaggi = exp.messages.map((m) => ({
  id: m.id,
  day: romeDay(m.created_at),
  scritto: m.created_at,
  username: m.username,
  notizia: titleOf[m.card_id] ?? m.card_id,
  card_id: m.card_id,
  testo: m.body,
  segnalazioni: m.reports,
}));

const consumo = readJson(consumoFile, []);
const sessioni = readJson(sessioniFile, { sessioni: [] });

// ---- plan usage limits: history of readings, latest per window ----
const limitiIn = readJson(limitiFile, { letture: [], extra: null });
const historyFile = path.join(os.homedir(), ".config/cinque-regia/limiti-storia.json");
const storia = readJson(historyFile, []);
for (const r of limitiIn.letture) {
  if (!storia.some((h) => h.letto === r.letto && h.finestra === r.finestra)) storia.push(r);
}
storia.sort((a, b) => a.letto.localeCompare(b.letto));
fs.mkdirSync(path.dirname(historyFile), { recursive: true });
fs.writeFileSync(historyFile, JSON.stringify(storia, null, 1) + "\n");
const limiti = [...new Set(storia.map((r) => r.finestra))].map((f) => storia.filter((r) => r.finestra === f).at(-1));

// How many dollars at list price fill one percent of each window. Measured on 24/10: between
// 11:35 and 11:53 this session spent $3.14 and the 5-hour window went from 68% to 76%; the weekly
// window was at 37% after about $67 of sessions since it opened on 22/10 at 21:00. Rough: the plan
// counts all Claude use (chat included) and rounds the percentages.
const STIME = [
  { finestra: "5 ore", dollari_per_punto: 0.39, metodo: "3,14 $ per 8 punti, 24/10" },
  { finestra: "7 giorni", dollari_per_punto: 1.8, metodo: "67 $ per 37 punti, 22-24/10" },
];

// CSV, so that an empty discussion still has its columns.
const csvCell = (v) => (v == null ? "" : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const MSG_COLS = ["id", "day", "scritto", "username", "notizia", "card_id", "testo", "segnalazioni"];
const messaggiCsv = [MSG_COLS.join(","), ...messaggi.map((m) => MSG_COLS.map((c) => csvCell(m[c])).join(","))].join("\n") + "\n";

fs.mkdirSync(outDir, { recursive: true });
const write = (name, rows) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(rows) + "\n");
write("utenti.json", utenti);
write("attivita.json", attivita);
write("notizie.json", notizie);
fs.writeFileSync(path.join(outDir, "messaggi.csv"), messaggiCsv);
write("consumo.json", consumo);
write("sessioni.json", sessioni.sessioni);
write("limiti.json", limiti);
write("limiti_storia.json", storia);
write("extra.json", limitiIn.extra ? [limitiIn.extra] : []);
write("stime.json", STIME);
console.log(
  `utenti ${utenti.length}, giorni attivi ${attivita.length}, notizie ${notizie.length}, messaggi ${messaggi.length}, consumo ${consumo.length}, sessioni ${sessioni.sessioni.length}, letture dei limiti ${storia.length}`,
);
