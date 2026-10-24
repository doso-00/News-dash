// Writes the morning summary email from the dashboard files made by build.mjs.
//
//   node scripts/regia/mail.mjs <out dir>
//
// Creates <out dir>/mail.html and <out dir>/mail.txt and prints the subject. Only counts and
// percentages go in the email: no message texts.
import fs from "node:fs";
import path from "node:path";
import { ROOT, readJson, romeDate } from "../store.mjs";

const outDir = process.argv[2];
if (!outDir) {
  console.error("uso: node scripts/regia/mail.mjs <out dir>");
  process.exit(1);
}
const read = (name) => readJson(path.join(outDir, name), []);
const consumo = read("consumo.json");
const limiti = read("limiti.json");
const stime = read("stime.json");
const extra = read("extra.json")[0];
const utenti = read("utenti.json");
const attivita = read("attivita.json");
const notizie = read("notizie.json");
const messaggi = fs.existsSync(path.join(outDir, "messaggi.csv"))
  ? fs.readFileSync(path.join(outDir, "messaggi.csv"), "utf8").trim().split("\n").length - 1
  : 0;

const DASH = "https://claude.ai/artifact/EWucDwXHFKLgoGdbBTshQw";
const APP = "https://doso-00.github.io/News-dash/";
const today = romeDate();
const latest = readJson(path.join(ROOT, "data/latest.json"), null);

const num = (v, d) => v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v) => (v == null ? "—" : `${num(v * 100, v < 0.1 ? 1 : 0)}%`);
const usd = (v) => (v == null ? "—" : `${num(v, 2)} $`);
const dayName = (d) => new Intl.DateTimeFormat("it-IT", { timeZone: "UTC", day: "numeric", month: "long" }).format(new Date(d));
const when = (iso) =>
  new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const win = (f) => limiti.find((l) => l.finestra === f);
const week = win("7 giorni");
const five = win("5 ore");
const perPoint = (f) => stime.find((s) => s.finestra === f)?.dollari_per_punto;

// What the latest edition cost, as dollars and as a share of each limit.
const redDays = [...new Set(consumo.filter((r) => r.attivita === "redazione").map((r) => r.day))].sort();
const edDay = redDays.at(-1);
const edCost = edDay ? consumo.filter((r) => r.attivita === "redazione" && r.day === edDay).reduce((s, r) => s + r.costo, 0) : null;
const edShare = (f) => (edCost != null && perPoint(f) ? edCost / perPoint(f) / 100 : null);
const avg = redDays.length
  ? redDays.reduce((s, d) => s + consumo.filter((r) => r.attivita === "redazione" && r.day === d).reduce((a, r) => a + r.costo, 0), 0) / redDays.length
  : null;
const left = week && avg && perPoint("7 giorni") ? Math.floor((1 - week.usato) / (avg / perPoint("7 giorni") / 100)) : null;

const lastActive = attivita.map((r) => r.day).sort().at(-1);
const activeToday = new Set(attivita.filter((r) => r.day === today).map((r) => r.username)).size;
const rooms = notizie.filter((n) => n.persone >= 2).length;
const warn = [week, five].some((w) => w && w.usato >= 0.8);

const subject = `Cinque al Mattino · ${latest?.date === today ? `edizione n. ${latest.number}` : "riepilogo"} del ${dayName(today)}${warn ? " · limite oltre l'80%" : ""}`;

const rows = [
  ["Settimana", week ? `usato ${pct(week.usato)}, rimane <b>${pct(1 - week.usato)}</b>` : "—", week ? `si azzera ${when(week.si_azzera)}` : ""],
  ["5 ore", five ? `usato ${pct(five.usato)}, rimane <b>${pct(1 - five.usato)}</b>` : "—", five ? `si azzera ${when(five.si_azzera)}` : ""],
  ["Costi extra", extra?.in_uso === "no" ? "<b>nessuno</b>" : esc(extra?.in_uso ?? "—"), esc(extra?.motivo ?? "")],
];
const cardList = latest?.date === today ? latest.cards.map((c) => `<li><span style="color:#888">${esc(c.label)}</span> · ${esc(c.title)}</li>`).join("") : "";
const extrasLine =
  latest?.date === today && latest.extras?.length ? `<p style="margin:6px 0 0;color:#666;font-size:13px">Più ${latest.extras.length} schede su misura: ${esc([...new Set(latest.extras.map((x) => x.label))].join(", "))}.</p>` : "";

const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;color:#1f1f1f;line-height:1.5">
<h2 style="font-weight:500;margin:0 0 4px">${esc(subject)}</h2>
${latest?.date === today ? `<p style="margin:0 0 12px;color:#555">${esc(latest.headline)}</p><ul style="padding-left:18px;margin:0">${cardList}</ul>${extrasLine}` : `<p style="color:#555">Oggi non c'è una nuova edizione.</p>`}
<h3 style="font-weight:500;margin:20px 0 6px">Il tuo abbonamento Claude</h3>
<table style="border-collapse:collapse;width:100%;font-size:14px">${rows.map(([a, b, c]) => `<tr><td style="padding:4px 8px 4px 0;color:#555;white-space:nowrap">${a}</td><td style="padding:4px 8px">${b}</td><td style="padding:4px 0;color:#888;font-size:12px">${c}</td></tr>`).join("")}</table>
<p style="margin:8px 0 0;font-size:14px">${edCost != null ? `L'edizione del ${dayName(edDay)} è costata circa ${usd(edCost)} a prezzi di listino, cioè ${pct(edShare("7 giorni"))} della settimana e ${pct(edShare("5 ore"))} delle 5 ore.` : "Nessuna edizione misurata finora."}${left != null ? ` Con quello che ti resta ci stanno ancora circa ${left} edizioni.` : ""}</p>
<h3 style="font-weight:500;margin:20px 0 6px">L'app</h3>
<p style="margin:0;font-size:14px">${utenti.length} utenti, ${activeToday} attivi oggi${lastActive && lastActive !== today ? ` (ultimo accesso il ${dayName(lastActive)})` : ""}. ${notizie.length} schede pubblicate, ${rooms} discussioni aperte, ${messaggi} messaggi.</p>
<p style="margin:20px 0 0;font-size:14px"><a href="${DASH}">Apri la regia</a> · <a href="${APP}">Apri l'app</a></p>
<p style="margin:16px 0 0;color:#999;font-size:12px">Le percentuali vengono dal tuo piano Claude; i costi per edizione sono stime. Mail inviata dalla redazione automatica delle 6:14.</p>
</div>`;

const text = [
  subject,
  "",
  latest?.date === today ? `${latest.headline}\n${latest.cards.map((c) => `- ${c.label}: ${c.title}`).join("\n")}` : "Oggi non c'è una nuova edizione.",
  "",
  `Abbonamento: settimana usato ${pct(week?.usato)} (rimane ${pct(week ? 1 - week.usato : null)}), 5 ore usato ${pct(five?.usato)} (rimane ${pct(five ? 1 - five.usato : null)}). Costi extra: ${extra?.in_uso === "no" ? "nessuno" : extra?.in_uso ?? "—"}.`,
  edCost != null ? `Ultima edizione: circa ${usd(edCost)}, ${pct(edShare("7 giorni"))} della settimana.` : "",
  `App: ${utenti.length} utenti, ${activeToday} attivi oggi, ${notizie.length} schede, ${messaggi} messaggi.`,
  "",
  `Regia: ${DASH}`,
  `App: ${APP}`,
].join("\n");

fs.writeFileSync(path.join(outDir, "mail.html"), html);
fs.writeFileSync(path.join(outDir, "mail.txt"), text + "\n");
console.log(subject);
