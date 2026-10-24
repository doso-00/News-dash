// Builds the data files of the owner's control dashboard ("Regia").
//
//   node scripts/regia/build.mjs <export.json> <consumo.json> <sessioni.json> <out dir>
//
// export.json   the decrypted output of the "Esporta regia" workflow (profiles and messages)
// consumo.json  the output of scripts/regia/consumo.mjs
// sessioni.json [{titolo, costo, creata, aggiornata, progetto}] from list_sessions, plus the
//               rate limit as {limiti: {stato, finestra, reset}} in its first row's place, see README
//
// The files go to the dashboard as attachments: they never enter the repository.
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson } from "../store.mjs";
import { INTEREST_LABEL } from "../../interests.js";

const [exportFile, consumoFile, sessioniFile, outDir] = process.argv.slice(2);
if (!outDir) {
  console.error("uso: node scripts/regia/build.mjs <export.json> <consumo.json> <sessioni.json> <out dir>");
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
const sessioni = readJson(sessioniFile, { sessioni: [], limiti: null });

fs.mkdirSync(outDir, { recursive: true });
const write = (name, rows) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(rows) + "\n");
write("utenti.json", utenti);
write("attivita.json", attivita);
write("notizie.json", notizie);
write("messaggi.json", messaggi);
write("consumo.json", consumo);
write("sessioni.json", sessioni.sessioni);
write("limiti.json", sessioni.limiti ? [sessioni.limiti] : []);
console.log(
  `utenti ${utenti.length}, giorni attivi ${attivita.length}, notizie ${notizie.length}, messaggi ${messaggi.length}, consumo ${consumo.length}, sessioni ${sessioni.sessioni.length}`,
);
