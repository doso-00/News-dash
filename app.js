// Cinque al Mattino — client app. No build step: plain ES module.

import { BackendError, connect, normalizeUsername, validUsername } from "./backend.js";

const SDK_URL = "./vendor/anthropic-sdk.mjs"; // built by `npm run build:sdk`
const MODEL = "claude-opus-5-5";
const STORE_KEY = "cinque:v1";
const CATS = ["ai", "finanza", "mondo", "sapere", "routine"];
const CAT_LABEL = {
  ai: "Intelligenza artificiale",
  finanza: "Finanza",
  mondo: "Mondo",
  sapere: "Sapere",
  routine: "Metodo & routine",
};
const CAT_SHORT = { ai: "AI", finanza: "Finanza", mondo: "Mondo", sapere: "Sapere", routine: "Routine" };
const ICONS = {
  ai: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21"/>',
  finanza: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  mondo: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  sapere: '<path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5c-3.5-.5-6.5 0-8.5 1.5zM12 6.5V19"/>',
  routine: '<path d="M3 18.5h18M6.5 18.5a5.5 5.5 0 0 1 11 0M12 4v3.5M5 9l2.2 2.2M19 9l-2.2 2.2"/>',
};
const REVIEW_STEPS = [1, 3, 7]; // days until a missed question comes back
const MIN_INTERESTS = 3;
const INTERESTS = [
  ["ai", "Intelligenza artificiale"],
  ["tech", "Tecnologia"],
  ["code", "Programmazione e dati"],
  ["finanza", "Finanza e investimenti"],
  ["economia", "Economia"],
  ["politica", "Politica italiana"],
  ["geopolitica", "Geopolitica"],
  ["scienza", "Scienza"],
  ["salute", "Salute e benessere"],
  ["sport", "Sport"],
  ["crescita", "Crescita personale"],
  ["produttivita", "Produttività"],
  ["psicologia", "Psicologia"],
  ["storia", "Storia"],
  ["cultura", "Libri e cultura"],
  ["cinema", "Cinema e serie"],
  ["musica", "Musica"],
  ["viaggi", "Viaggi"],
  ["clima", "Ambiente e clima"],
  ["startup", "Imprenditoria e startup"],
  ["lavoro", "Lavoro e carriera"],
  ["cucina", "Cucina"],
];
const INTEREST_LABEL = Object.fromEntries(INTERESTS);

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- storage ----------

const USER_KEY = "cinque:user"; // profile of whoever is signed in on this device
const LEGACY_KEY = "cinque:v1"; // progress saved before profiles existed
const userKey = (username) => `cinque:v1:u:${username}`;

const defaults = () => ({
  read: {}, // cardId -> date read
  understood: {}, // cardId -> true | false
  saved: {}, // cardId -> { title, category, date }
  checklist: {}, // cardId -> [bool]
  activity: {}, // YYYY-MM-DD -> true
  quiz: {}, // edition date -> { score, total, at }
  catStats: {}, // category -> { right, total }
  answers: {}, // cardId -> reflection text
  review: [], // missed questions waiting to come back
  friends: [], // usernames to compare with
  interests: [], // ids from INTERESTS
  updatedAt: 0,
  settings: { theme: "system", font: "1", apiKey: "" },
});

function readState(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const base = defaults();
    return { ...base, ...saved, settings: { ...base.settings, ...saved.settings } };
  } catch {
    return null;
  }
}

const state = defaults();
let me = null; // { username, first_name, last_name }
let backend = null;

function replaceState(next) {
  for (const k of Object.keys(state)) delete state[k];
  const base = defaults();
  Object.assign(state, base, next, { settings: { ...base.settings, ...next?.settings } });
}

function saveLocal() {
  if (!me) return;
  try {
    localStorage.setItem(userKey(me.username), JSON.stringify(state));
  } catch {
    /* storage unavailable: keep working in memory */
  }
}

function persist() {
  state.updatedAt = Date.now();
  saveLocal();
  scheduleSync();
}

// ---------- sync with the shared database ----------

let syncTimer = null;
function scheduleSync() {
  if (!me || !backend) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 1500);
}

// The API key and reflection answers never leave the device.
const shareable = (s) => ({ ...s, answers: {}, settings: { ...s.settings, apiKey: "" } });

async function syncNow() {
  clearTimeout(syncTimer);
  syncTimer = null;
  if (!me || !backend) return;
  try {
    await backend.savePlayer(me.username, { state: shareable(state), stats: computeStats(state) });
  } catch {
    /* offline: the next change retries */
  }
}

const sumCats = (cats) =>
  Object.values(cats ?? {}).reduce((a, b) => ({ right: a.right + b.right, total: a.total + b.total }), { right: 0, total: 0 });
const routineCount = (checklist) =>
  Object.entries(checklist).filter(([id, list]) => id.endsWith("-routine") && list.length && list.every(Boolean)).length;
const pointsFor = (read, right, routine) => read * 10 + right * 5 + routine * 20;

// What friends see: totals only, never the cards' answers or settings.
function computeStats(s) {
  const totals = sumCats(s.catStats);
  const read = Object.keys(s.read).length;
  const routineDays = routineCount(s.checklist);
  return {
    read,
    quizRight: totals.right,
    quizTotal: totals.total,
    routineDays,
    byCat: s.catStats,
    activity: Object.keys(s.activity).sort().slice(-60),
    interests: s.interests,
    points: pointsFor(read, totals.right, routineDays),
  };
}

// ---------- dates ----------

const localDate = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
};
const longDate = (iso) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
const shortDate = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });

function streak(activity = state.activity) {
  let day = localDate();
  if (!activity[day]) day = addDays(day, -1);
  let n = 0;
  while (activity[day]) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

// ---------- data ----------

let latest = null;
let edition = null;
let index = { days: [] };
const dayCache = new Map();

async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function loadEdition(date) {
  if (date === latest?.date) return latest;
  if (!dayCache.has(date)) dayCache.set(date, await fetchJson(`data/days/${date}.json`));
  return dayCache.get(date);
}

// ---------- shell ----------

function applySettings() {
  const root = document.documentElement;
  if (state.settings.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", state.settings.theme);
  root.style.setProperty("--scale", state.settings.font);
}

let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

function ring(cards) {
  const r = 22;
  const c = 29;
  const seg = 360 / cards.length;
  const gap = 10;
  const pt = (deg) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  };
  const read = cards.filter((k) => state.read[k.id]).length;
  const arcs = cards
    .map((k, i) => {
      const a0 = i * seg + gap / 2;
      const a1 = (i + 1) * seg - gap / 2;
      const on = state.read[k.id];
      return `<path d="M ${pt(a0)} A ${r} ${r} 0 0 1 ${pt(a1)}" data-cat="${k.category}" style="stroke:${on ? "var(--c)" : "var(--line)"}" fill="none" stroke-width="6" stroke-linecap="round"/>`;
    })
    .join("");
  $("#ring").innerHTML = `<svg viewBox="0 0 58 58" role="img" aria-label="${read} schede lette su ${cards.length}">${arcs}<text x="29" y="33.5" text-anchor="middle" class="ring-num">${read}/${cards.length}</text></svg>`;
}

// ---------- today ----------

function cardStatus(card) {
  if (state.understood[card.id] === true) return ["Capito", "read"];
  if (state.understood[card.id] === false) return ["Da rivedere", "read"];
  if (state.read[card.id]) return ["Letto", "read"];
  return ["Da leggere", ""];
}

function renderToday() {
  const isToday = edition.date === latest.date;
  $("#edition-meta").textContent = `${longDate(edition.date)} · n.${edition.number}`;
  $("#past-banner").hidden = isToday;
  $("#past-label").textContent = `Stai leggendo l'edizione del ${longDate(edition.date)}`;
  $("#headline").textContent = edition.headline;
  $("#hello").textContent = `Ciao ${me.first_name}, ecco le tue cinque di oggi`;
  const imp = pendingImport;
  $("#import-banner").hidden = !imp;
  if (imp) {
    const n = Object.keys(imp.state.read).length;
    $("#import-text").textContent = `Su questo telefono ci sono progressi ${imp.from ? `del profilo @${imp.from}` : "salvati prima dei profili"}: ${n} ${n === 1 ? "scheda letta" : "schede lette"}. Vuoi spostarli in @${me.username}?`;
  }

  const s = streak();
  const quiz = state.quiz[edition.date];
  const due = dueReviews().length;
  $("#streak-row").innerHTML = [
    `<span class="pill ${s ? "on" : ""}"><strong>${s}</strong> ${s === 1 ? "giorno" : "giorni"} di fila</span>`,
    `<span class="pill ${quiz ? "on" : ""}">Quiz <strong>${quiz ? `${quiz.score}/${quiz.total}` : "da fare"}</strong></span>`,
    due ? `<span class="pill">Ripasso <strong>${due}</strong></span>` : "",
  ].join("");

  $("#stories-cta").innerHTML = `<button type="button" class="stories-btn" data-stories="0">
      <span class="stories-dots">${edition.cards.map((c) => `<i data-cat="${c.category}"></i>`).join("")}</span>
      <span><strong>Sfoglia le 5 notizie</strong><small>circa 1 minuto</small></span>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg>
    </button>`;

  $("#cards").innerHTML = edition.cards
    .map((card, i) => {
      const [label, cls] = cardStatus(card);
      return `<li><button type="button" class="card ${i === 0 ? "lead" : ""}" data-cat="${card.category}" data-open="${esc(card.id)}">
        <span class="glyph"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[card.category]}</svg></span>
        <span class="card-top"><span class="card-label">${CAT_SHORT[card.category]} · ${card.readingMinutes} min</span><span class="status ${cls}">${label}</span></span>
        <h3 class="card-title">${esc(card.title)}</h3>
        <p class="card-summary">${esc(plain(card.summary))}</p>
        ${card.stat ? `<span class="card-stat"><b>${esc(card.stat.value)}</b> ${esc(card.stat.label)}</span>` : ""}
      </button></li>`;
    })
    .join("");

  const total = edition.cards.reduce((n, c) => n + c.quiz.length, 0);
  $("#quiz-cta").innerHTML = `<a class="cta" href="#quiz">
      <div><strong>${quiz ? "Rivedi il quiz" : "Mettiti alla prova"}</strong><span>${total} domande${due ? ` + ${Math.min(due, 3)} di ripasso` : ""} · circa 4 minuti</span></div>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </a>`;
  ring(edition.cards);
}

// ---------- reading sheet ----------

let openCard = null;
let readObserver = null;

function markRead(card) {
  if (state.read[card.id]) return;
  state.read[card.id] = localDate();
  state.activity[localDate()] = true;
  persist();
  renderToday();
}

function openSheet(card, { push = true } = {}) {
  openCard = card;
  const sheet = $("#sheet");
  sheet.dataset.cat = card.category;
  $("#sheet-cat").textContent = card.label;
  $("#sheet-save").setAttribute("aria-pressed", String(Boolean(state.saved[card.id])));
  const checks = state.checklist[card.id] ?? [];

  const sections = sectionsOf(card);
  const linkTerm = termLinker(card);
  const idx = edition.cards.indexOf(card);
  const next = edition.cards[idx + 1];

  $("#sheet-body").innerHTML = `
    <header class="story-head">
      <p class="eyebrow">${longDate(edition.date)} · ${card.readingMinutes} min</p>
      <h2 id="sheet-title">${esc(card.title)}</h2>
      <p class="sheet-sub">${esc(card.subtitle)}</p>
    </header>

    ${card.stat ? `<div class="stat-hero"><span class="stat-value">${esc(card.stat.value)}</span><span class="stat-label">${esc(card.stat.label)}</span></div>` : ""}

    <section class="tldr" aria-label="In 30 secondi">
      <h3>In 30 secondi</h3>
      <p>${rich(card.summary)}</p>
      <ul>${card.keyPoints.map((p) => `<li>${rich(p)}</li>`).join("")}</ul>
    </section>

    <ol class="story">
      ${sections
        .map(
          (sec) => `<li class="beat">
            ${sec.heading ? `<h3>${esc(sec.heading)}</h3>` : ""}
            <p>${linkTerm(rich(sec.text))}</p>
          </li>`,
        )
        .join("")}
    </ol>

    <section class="block">
      <div class="callout"><h3>Perché ti riguarda</h3><p>${rich(card.whyItMatters)}</p></div>
      <div class="callout"><h3>Da fare oggi</h3><p>${rich(card.actionToday)}</p>
        <button type="button" class="link-btn copy-action" data-copy-action>Copia</button></div>
    </section>

    ${
      card.checklist.length
        ? `<section class="block"><h3>La routine di oggi</h3><ul class="checklist">${card.checklist
            .map(
              (item, i) =>
                `<li><label><input type="checkbox" id="chk-${esc(card.id)}-${i}" data-check="${i}" ${checks[i] ? "checked" : ""}><span>${esc(item)}</span></label></li>`,
            )
            .join("")}</ul></section>`
        : ""
    }

    <section class="block"><h3>Glossario</h3>
      <dl class="glossary">${card.glossary.map((g) => `<div><dt>${esc(g.term)}</dt><dd>${esc(g.meaning)}</dd></div>`).join("")}</dl>
    </section>

    <section class="block"><h3>Approfondimenti</h3>
      ${card.deepDive.map((d) => `<details class="dive"><summary>${esc(d.title)}</summary><p>${esc(d.text)}</p></details>`).join("")}
    </section>

    ${
      card.sources.length
        ? `<section class="block"><h3>Fonti</h3><ul class="sources">${card.sources
            .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a></li>`)
            .join("")}</ul></section>`
        : ""
    }

    <section class="understand" id="understand">
      <p>Ti è chiaro?</p>
      <div class="btn-row">
        <button type="button" class="btn" data-understood="yes">Ho capito</button>
        <button type="button" class="btn ghost" data-understood="no">Non ho capito</button>
        <button type="button" class="btn tint" data-quiz-card="${esc(card.id)}">Quiz su questo tema</button>
      </div>
      <div class="eli5" id="eli5" ${state.understood[card.id] === false ? "" : "hidden"}>
        <div class="callout"><h3>In parole semplici</h3><p>${esc(card.eli5)}</p></div>
        ${askBox(card, "Cosa non ti è chiaro? Chiedi a Claude…")}
      </div>
    </section>

    ${
      next
        ? `<button type="button" class="next-card" data-cat="${next.category}" data-next="${esc(next.id)}">
            <span class="card-label">Prossima · ${CAT_SHORT[next.category]}</span>
            <strong>${esc(next.title)}</strong>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </button>`
        : `<a class="next-card done" href="#quiz" data-close-to-quiz>
            <span class="card-label">Hai letto tutto</span>
            <strong>Mettiti alla prova con il quiz</strong>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </a>`
    }`;

  sheet.hidden = false;
  sheet.scrollTop = 0;
  updateProgress();
  revealBeats();
  document.body.style.overflow = "hidden";
  if (push) history.pushState({ sheet: card.id }, "", location.hash || "#oggi");

  readObserver?.disconnect();
  readObserver = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      markRead(card);
      readObserver.disconnect();
    }
  });
  readObserver.observe($("#understand"));
  $("#sheet-close").focus();
}

// Older editions have a plain `body`; newer ones have titled sections.
const sectionsOf = (card) => card.sections ?? card.body.map((text) => ({ heading: "", text }));
const plain = (text) => String(text ?? "").replace(/\*\*(.+?)\*\*/g, "$1");
const rich = (text) => esc(text).replace(/\*\*(.+?)\*\*/g, "<mark>$1</mark>");

// Turns the first mention of each glossary term into a tappable word.
function termLinker(card) {
  const used = new Set();
  return (html) => {
    card.glossary.forEach((g, i) => {
      if (used.has(i)) return;
      const re = new RegExp(`(^|[^\\p{L}])(${esc(g.term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=[^\\p{L}]|$)`, "iu");
      if (!re.test(html)) return;
      used.add(i);
      html = html.replace(re, `$1<button type="button" class="term" data-term="${i}">$2</button>`);
    });
    return html;
  };
}

function showTerm(i) {
  const g = openCard.glossary[i];
  const pop = $("#termpop");
  pop.innerHTML = `<strong>${esc(g.term)}</strong><span>${esc(g.meaning)}</span>`;
  pop.hidden = false;
}

function updateProgress() {
  const sheet = $("#sheet");
  const max = sheet.scrollHeight - sheet.clientHeight;
  $("#read-progress").style.transform = `scaleX(${max > 0 ? Math.min(1, sheet.scrollTop / max) : 0})`;
}

let beatObserver = null;
function revealBeats() {
  beatObserver?.disconnect();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  beatObserver = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("seen");
          beatObserver.unobserve(e.target);
        }
      }),
    { root: $("#sheet"), threshold: 0.35 },
  );
  document.querySelectorAll("#sheet-body .beat").forEach((el) => beatObserver.observe(el));
}

function closeSheet() {
  if ($("#sheet").hidden) return;
  stopSpeaking();
  $("#sheet").hidden = true;
  document.body.style.overflow = "";
  readObserver?.disconnect();
  openCard = null;
}

function findCard(id) {
  return edition.cards.find((c) => c.id === id);
}

// ---------- stories: the five cards at a glance ----------

let story = null;

function openStories(start = 0) {
  story = { i: start };
  $("#stories").hidden = false;
  document.body.style.overflow = "hidden";
  renderStory();
  $("#stories-close").focus();
}

function renderStory() {
  const card = edition.cards[story.i];
  $("#stories").dataset.cat = card.category;
  $("#stories-bar").innerHTML = edition.cards
    .map((c, i) => `<i class="${i < story.i ? "done" : i === story.i ? "now" : ""}"><b></b></i>`)
    .join("");
  $("#story-slide").innerHTML = `
    <span class="story-cat"><span class="glyph"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[card.category]}</svg></span>${esc(card.label)}</span>
    ${card.stat ? `<p class="story-stat">${esc(card.stat.value)}</p><p class="story-stat-label">${esc(card.stat.label)}</p>` : ""}
    <h2>${esc(card.title)}</h2>
    <ul>${card.keyPoints.map((p) => `<li>${rich(p)}</li>`).join("")}</ul>
    <button type="button" class="btn story-read" data-story-read="${esc(card.id)}">Leggi tutto</button>`;
}

function storyStep(delta) {
  const n = story.i + delta;
  if (n < 0) return;
  if (n >= edition.cards.length) {
    closeStories();
    return toast("Fatto. Apri una scheda per approfondire.");
  }
  story.i = n;
  renderStory();
}

function closeStories() {
  if (!story) return;
  $("#stories").hidden = true;
  document.body.style.overflow = "";
  story = null;
}

// ---------- text to speech ----------

function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  $("#sheet-listen").classList.remove("speaking");
}

function toggleSpeak() {
  if (!("speechSynthesis" in window)) return toast("La lettura vocale non è disponibile su questo browser");
  if (speechSynthesis.speaking) return stopSpeaking();
  const card = openCard;
  const u = new SpeechSynthesisUtterance(
    [card.title, card.summary, ...sectionsOf(card).map((x) => `${x.heading}. ${x.text}`), card.whyItMatters].map(plain).join(". "),
  );
  u.lang = "it-IT";
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith("it"));
  if (voice) u.voice = voice;
  u.rate = 1.02;
  u.onend = u.onerror = () => $("#sheet-listen").classList.remove("speaking");
  $("#sheet-listen").classList.add("speaking");
  speechSynthesis.speak(u);
}

// ---------- Claude ----------

const chats = new Map(); // key -> messages[]
let sdkPromise = null;

function askBox(card, placeholder, key = `ask-${card.id}`, preset = "") {
  return `<div class="chat" id="${esc(key)}" data-chat="${esc(key)}" data-card="${esc(card.id)}">
    <div class="chat-log"></div>
    <div class="ask-row">
      <textarea id="${esc(key)}-input" rows="2" placeholder="${esc(placeholder)}">${esc(preset)}</textarea>
    </div>
    <div class="btn-row">
      ${
        state.settings.apiKey
          ? `<button type="button" class="btn" data-send="${esc(key)}">Chiedi a Claude</button>`
          : `<a class="btn" data-claude-link href="${esc(claudeUrl(card, framedQuestion(key, card, preset)))}" target="_blank" rel="noopener">Apri in Claude</a>`
      }
      <button type="button" class="btn ghost" data-copy="${esc(key)}">Copia domanda</button>
    </div>
  </div>`;
}

function tutorSystem(card) {
  return `Sei il tutor personale dell'app "Cinque al Mattino". Rispondi in italiano, in modo chiaro e concreto, con esempi quotidiani. Sii breve (massimo 180 parole) salvo richiesta diversa. Se la domanda va oltre la scheda, rispondi comunque ma segnala cosa non è verificato.
Scheda di oggi (JSON):
${JSON.stringify({ titolo: card.title, sintesi: plain(card.summary), testo: sectionsOf(card).map((x) => plain(x.text)), punti: card.keyPoints.map(plain), glossario: card.glossary, fonti: card.sources })}`;
}

function promptForClaudeApp(card, question) {
  return `Sto studiando questo argomento: "${card.title}".
Sintesi: ${plain(card.summary)}
${question}
Rispondi in italiano, in modo semplice e con un esempio concreto.`;
}

const claudeUrl = (card, question) =>
  `https://claude.ai/new?q=${encodeURIComponent(promptForClaudeApp(card, question || "Spiegami meglio questo argomento.").slice(0, 1800))}`;

// Reflection boxes send the answer wrapped in a request for feedback.
const framedQuestion = (key, card, typed) => (key.startsWith("refl-") && typed ? reflectionQuestion(card, typed) : typed);

function md(text) {
  const lines = esc(text).split("\n");
  let out = "";
  let list = false;
  for (const line of lines) {
    const item = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (item) {
      if (!list) out += "<ul>";
      list = true;
      out += `<li>${inline(item[1])}</li>`;
      continue;
    }
    if (list) out += "</ul>";
    list = false;
    if (line.trim()) out += `<p>${inline(line)}</p>`;
  }
  if (list) out += "</ul>";
  return out;
}
const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");

// `question` is what Claude receives; the bubble shows what the user typed.
async function sendToClaude(key, framed = null) {
  const box = document.querySelector(`[data-chat="${CSS.escape(key)}"]`);
  const card = findCard(box.dataset.card);
  const input = $("textarea", box);
  const typed = input.value.trim();
  if (!typed) return input.focus();
  const question = framed ?? typed;

  const log = $(".chat-log", box);
  const btn = $("[data-send]", box);
  log.insertAdjacentHTML("beforeend", `<div class="bubble me">${esc(typed)}</div><div class="bubble ai"><p>…</p></div>`);
  const out = log.lastElementChild;
  input.value = "";
  btn.disabled = true;

  const messages = chats.get(key) ?? [];
  messages.push({ role: "user", content: question });
  let text = "";
  try {
    sdkPromise ??= import(SDK_URL);
    const sdk = await sdkPromise;
    const Anthropic = sdk.default ?? sdk.Anthropic;
    const client = new Anthropic({ apiKey: state.settings.apiKey, dangerouslyAllowBrowser: true });
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: tutorSystem(card),
      messages,
    });
    stream.on("text", (delta) => {
      text += delta;
      out.innerHTML = md(text);
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new Error("Claude non può rispondere a questa domanda. Prova a riformularla.");
    messages.push({ role: "assistant", content: message.content });
    chats.set(key, messages);
  } catch (err) {
    messages.pop();
    out.className = "bubble err";
    out.textContent = claudeError(err);
  } finally {
    btn.disabled = false;
  }
}

function claudeError(err) {
  const status = err?.status;
  if (status === 401) return "La chiave API non è valida. Controllala in Progressi → Impostazioni.";
  if (status === 429) return "Troppe richieste in poco tempo. Riprova tra un minuto.";
  if (status >= 500) return "Il servizio di Claude non risponde in questo momento. Riprova più tardi.";
  if (err instanceof TypeError) return "Connessione non riuscita. Controlla la rete e riprova.";
  return err?.message ?? "Qualcosa è andato storto. Riprova.";
}

async function copyQuestion(key) {
  const box = document.querySelector(`[data-chat="${CSS.escape(key)}"]`);
  const card = findCard(box.dataset.card);
  const q = framedQuestion(key, card, $("textarea", box).value.trim()) || "Spiegami meglio questo argomento.";
  const text = promptForClaudeApp(card, q);
  try {
    await navigator.clipboard.writeText(text);
    toast("Domanda copiata: incollala in Claude");
  } catch {
    const ta = $("textarea", box);
    ta.value = text;
    ta.select();
    toast("Seleziona e copia il testo");
  }
}

// ---------- quiz ----------

let session = null;

function dueReviews() {
  const today = localDate();
  return state.review.filter((r) => r.due <= today && r.date !== edition?.date);
}

function startQuiz(cardId = null) {
  const cards = cardId ? edition.cards.filter((c) => c.id === cardId) : edition.cards;
  const items = cards.flatMap((card) => card.quiz.map((q, i) => ({ card, q, qid: `${card.id}#${i}` })));
  if (!cardId) {
    for (const r of dueReviews().slice(0, 3)) {
      items.push({ card: { id: r.cardId, category: r.category, label: CAT_LABEL[r.category] }, q: r.q, qid: r.qid, review: true });
    }
  }
  session = { cardId, items, i: 0, results: [], picked: null };
  closeSheet();
  if (location.hash !== "#quiz") location.hash = "#quiz";
  else renderQuiz();
}

function renderQuiz() {
  const view = $("#view-quiz");
  if (!session) return renderQuizHome(view);
  if (session.i >= session.items.length) return renderQuizEnd(view);

  const item = session.items[session.i];
  const { q } = item;
  const answered = session.picked !== null;
  const bar = session.items
    .map((it, i) => {
      const res = session.results[i];
      const cls = i < session.results.length ? (res ? "done" : "wrong") : i === session.i ? "now" : "";
      return `<i data-cat="${it.card.category}" class="${cls}"></i>`;
    })
    .join("");

  view.innerHTML = `
    <div class="quiz-head"><h2>${session.cardId ? "Quiz del tema" : "Quiz di oggi"}</h2><span class="quiz-count">${session.i + 1} / ${session.items.length}</span></div>
    <div class="progress">${bar}</div>
    <div class="q-card" data-cat="${item.card.category}">
      <span class="card-label">${esc(item.card.label)}</span>${item.review ? '<span class="review-tag">ripasso</span>' : ""}
      <p class="q-text">${esc(q.q)}</p>
      <div class="options">
        ${q.options
          .map((opt, i) => {
            let cls = "";
            if (answered && i === q.answer) cls = "right";
            else if (answered && i === session.picked) cls = "wrong";
            return `<button type="button" class="opt ${cls}" data-pick="${i}" ${answered ? "disabled" : ""}><b>${"ABCD"[i]}</b><span>${esc(opt)}</span></button>`;
          })
          .join("")}
      </div>
      ${
        answered
          ? `<div class="explain"><strong>${session.picked === q.answer ? "Esatto." : "Non proprio."}</strong> ${esc(q.explanation)}</div>
             <div class="q-foot"><button type="button" class="btn" id="next-q">${session.i + 1 < session.items.length ? "Avanti" : "Vedi il risultato"}</button></div>`
          : ""
      }
    </div>`;
  if (answered) $("#next-q").focus();
}

function pick(i) {
  if (session.picked !== null) return;
  session.picked = i;
  const item = session.items[session.i];
  const right = i === item.q.answer;
  session.results.push(right);
  const cs = (state.catStats[item.card.category] ??= { right: 0, total: 0 });
  cs.total++;
  if (right) cs.right++;
  scheduleReview(item, right);
  state.activity[localDate()] = true;
  persist();
  renderQuiz();
}

function scheduleReview(item, right) {
  const today = localDate();
  const existing = state.review.find((r) => r.qid === item.qid);
  if (right) {
    if (!existing) return;
    existing.box++;
    if (existing.box >= REVIEW_STEPS.length) state.review = state.review.filter((r) => r !== existing);
    else existing.due = addDays(today, REVIEW_STEPS[existing.box]);
    return;
  }
  if (existing) {
    existing.box = 0;
    existing.due = addDays(today, REVIEW_STEPS[0]);
  } else {
    state.review.push({
      qid: item.qid,
      cardId: item.card.id,
      category: item.card.category,
      date: edition.date,
      q: item.q,
      box: 0,
      due: addDays(today, REVIEW_STEPS[0]),
    });
  }
}

function nextQuestion() {
  session.i++;
  session.picked = null;
  if (session.i >= session.items.length && !session.cardId) {
    const own = session.items.map((it, i) => [it, session.results[i]]).filter(([it]) => !it.review);
    state.quiz[edition.date] = { score: own.filter(([, r]) => r).length, total: own.length, at: Date.now() };
    persist();
  }
  renderQuiz();
  window.scrollTo({ top: 0 });
}

function renderQuizHome(view) {
  const done = state.quiz[edition.date];
  const total = edition.cards.reduce((n, c) => n + c.quiz.length, 0);
  const due = dueReviews().length;
  view.innerHTML = `
    <h2 class="view-title">Quiz</h2>
    <p class="headline">${done ? `Hai già fatto il quiz di questa edizione: <strong>${done.score}/${done.total}</strong>.` : `${total} domande sulle cinque schede${due ? `, più ${Math.min(due, 3)} di ripasso dai giorni scorsi` : ""}.`}</p>
    <div class="btn-row"><button type="button" class="btn" data-start-quiz>${done ? "Rifai il quiz" : "Inizia il quiz"}</button></div>
    <h3 class="section-label">Verifica la comprensione</h3>
    ${reflectionBlock()}`;
}

function renderQuizEnd(view) {
  const score = session.results.filter(Boolean).length;
  const byCat = {};
  session.items.forEach((it, i) => {
    const b = (byCat[it.card.category] ??= { right: 0, total: 0 });
    b.total++;
    if (session.results[i]) b.right++;
  });
  const weak = edition.cards.filter((c) => byCat[c.category] && byCat[c.category].right < byCat[c.category].total);
  const missed = session.results.filter((r) => !r).length;

  view.innerHTML = `
    <h2 class="view-title">Risultato</h2>
    <div class="score"><span class="score-num">${score}</span><span class="score-of">su ${session.items.length}</span></div>
    <p class="tip">${missed ? `Le ${missed === 1 ? "domanda sbagliata tornerà" : `${missed} domande sbagliate torneranno`} nel ripasso tra 1, 3 e 7 giorni.` : "Tutto giusto. Ottimo lavoro."}</p>
    <ul class="breakdown">
      ${CATS.filter((c) => byCat[c])
        .map(
          (c) => `<li data-cat="${c}"><span class="name"><span class="dot"></span>${CAT_LABEL[c]}</span><span class="res">${byCat[c].right}/${byCat[c].total}</span></li>`,
        )
        .join("")}
    </ul>
    ${
      weak.length
        ? `<h3 class="section-label">Da rivedere</h3><div class="btn-row">${weak
            .map((c) => `<button type="button" class="btn tint" data-cat="${c.category}" data-open="${esc(c.id)}">${esc(c.label)}</button>`)
            .join("")}</div>`
        : ""
    }
    <div class="btn-row" style="margin-top:18px"><button type="button" class="btn ghost" data-start-quiz>Rifai il quiz</button></div>
    <h3 class="section-label">Verifica la comprensione</h3>
    ${reflectionBlock(session.cardId)}`;
}

function reflectionBlock(onlyCard = null) {
  const cards = onlyCard ? edition.cards.filter((c) => c.id === onlyCard) : edition.cards;
  const intro = state.settings.apiKey
    ? "Rispondi con parole tue: Claude ti dirà cosa hai capito bene e cosa approfondire."
    : "Rispondi con parole tue, poi apri la risposta in Claude per un feedback. Con una chiave API in Impostazioni il feedback arriva qui.";
  return `<p class="tip">${intro}</p><div class="reflect">${cards
    .map((card) => {
      const key = `refl-${card.id}`;
      return `<div class="reflect-item" data-cat="${card.category}">
        <span class="card-label">${esc(card.label)}</span>
        <p>${esc(card.reflection)}</p>
        ${askBox(card, "La tua risposta…", key, state.answers[card.id] ?? "")}
      </div>`;
    })
    .join("")}</div>`;
}

// Reflection answers are framed as a request for feedback, not a free question.
function reflectionQuestion(card, answer) {
  return `Domanda di verifica: "${card.reflection}"
La mia risposta: "${answer}"
Dimmi cosa ho capito bene, cosa manca o è impreciso, e suggeriscimi un approfondimento.`;
}

// ---------- archive ----------

function renderArchive() {
  const saved = Object.entries(state.saved).sort((a, b) => b[1].date.localeCompare(a[1].date));
  $("#saved-list").innerHTML = `<h3 class="section-label">Salvati</h3>${
    saved.length
      ? `<ul class="saved">${saved
          .map(
            ([id, s]) =>
              `<li><button type="button" data-cat="${s.category}" data-open-day="${s.date}" data-open-id="${esc(id)}"><span class="card-label">${esc(CAT_LABEL[s.category])} · ${shortDate(s.date)}</span><span>${esc(s.title)}</span></button></li>`,
          )
          .join("")}</ul>`
      : '<p class="empty">Tocca il segnalibro in una scheda per ritrovarla qui.</p>'
  }`;
  $("#archive-list").innerHTML = index.days
    .map(
      (d) => `<li><button type="button" class="arch" data-open-day="${d.date}">
        <span class="arch-date">${longDate(d.date)} · n.${d.number}</span>
        <p class="arch-head">${esc(d.headline)}</p>
        <span class="arch-dots">${d.cards.map((c) => `<i data-cat="${c.category}" class="${state.read[`${d.date}-${c.category}`] ? "read" : ""}" title="${esc(c.title)}"></i>`).join("")}</span>
      </button></li>`,
    )
    .join("");
}

async function showDay(date, cardId = null) {
  try {
    edition = await loadEdition(date);
  } catch {
    return toast("Edizione non disponibile offline");
  }
  session = null;
  renderToday();
  location.hash = "#oggi";
  if (cardId) {
    const card = findCard(cardId);
    if (card) openSheet(card);
  }
}

// ---------- progress ----------

function renderStats() {
  const mine = computeStats(state);
  const reads = mine.read;
  const acc = mine.quizTotal ? Math.round((mine.quizRight / mine.quizTotal) * 100) : null;
  const routineDays = mine.routineDays;

  const days = Object.entries(state.quiz)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-14);
  const chart = days.length ? quizChart(days) : '<p class="empty">Il grafico si riempie quando completi il primo quiz.</p>';

  const catRows = CATS.map((c) => {
    const s = state.catStats[c];
    const pct = s?.total ? Math.round((s.right / s.total) * 100) : null;
    return { c, pct, s };
  });
  const scored = catRows.filter((r) => r.pct !== null && r.s.total >= 2).sort((a, b) => a.pct - b.pct);
  const weakest = scored.length > 1 && scored[0].pct < 100 ? scored[0] : null;

  $("#stats").innerHTML = `
    <div class="me-card">
      <span class="avatar" aria-hidden="true">${esc(initials(me))}</span>
      <div><strong>${esc(fullName(me))}</strong><span>@${esc(me.username)} · ${mine.points} punti</span></div>
      <button type="button" class="btn ghost" id="logout">Esci</button>
    </div>
    <div class="stats">
      <div class="stat"><b>${streak()}</b><span>giorni di fila</span></div>
      <div class="stat"><b>${reads}</b><span>schede lette</span></div>
      <div class="stat"><b>${acc === null ? "–" : `${acc}%`}</b><span>risposte giuste</span></div>
      <div class="stat"><b>${routineDays}</b><span>routine completate</span></div>
    </div>
    <h3 class="section-label">Quiz, ultimi 14 giorni</h3>
    <div class="chart">${chart}</div>
    <h3 class="section-label">Per tema</h3>
    <div class="bars">${catRows
      .map(
        ({ c, pct }) => `<div class="bar-row" data-cat="${c}"><span>${CAT_SHORT[c]}</span><span class="bar-track"><span class="bar-fill" style="width:${pct ?? 0}%"></span></span><span class="bar-val">${pct === null ? "–" : `${pct}%`}</span></div>`,
      )
      .join("")}</div>
    ${weakest ? `<p class="tip">Il tema da rinforzare è <strong>${CAT_LABEL[weakest.c]}</strong>: apri "Non ho capito" sulle prossime schede di questo tema.</p>` : ""}`;
}

// ---------- friends ----------

const fullName = (p) => `${p.first_name} ${p.last_name}`.trim();
const initials = (p) => `${p.first_name[0] ?? ""}${p.last_name[0] ?? ""}`.toUpperCase();
const pct = (right, total) => (total ? Math.round((right / total) * 100) : null);
const days = (n) => `${n} ${n === 1 ? "giorno" : "giorni"}`;
const streakOf = (stats) => streak(Object.fromEntries((stats?.activity ?? []).map((d) => [d, true])));

let openFriend = null;
let searchTimer = null;

function renderFriends() {
  $("#friends").innerHTML = `
    <div class="friend-search">
      <input type="search" id="friend-q" placeholder="Cerca per nome o username" autocomplete="off" spellcheck="false">
      <ul class="friend-results" id="friend-results"></ul>
    </div>
    <ol class="leaderboard" id="leaderboard"><li class="empty">Caricamento della classifica…</li></ol>
    <p class="tip">Punti: 10 per scheda letta, 5 per risposta giusta, 20 per routine completata.</p>
    ${
      backend.mode === "local"
        ? '<p class="tip">Modalità locale: trovi solo i profili creati su questo dispositivo. Con il database online vedrai gli amici da qualsiasi telefono.</p>'
        : ""
    }`;
  renderLeaderboard();
}

async function renderLeaderboard() {
  const list = $("#leaderboard");
  if (!list) return;
  let friends = [];
  try {
    friends = await backend.getMany(state.friends);
  } catch (err) {
    list.innerHTML = `<li class="empty">${esc(err.message)}</li>`;
    return;
  }
  const rows = [{ ...me, stats: computeStats(state), self: true }, ...friends].sort(
    (a, b) => (b.stats?.points ?? 0) - (a.stats?.points ?? 0),
  );
  if (rows.length === 1) {
    list.innerHTML = `${leaderRow(rows[0], 0)}<li class="empty">Cerca un amico qui sopra per iniziare il confronto.</li>`;
    return;
  }
  list.innerHTML = rows.map(leaderRow).join("");
}

function leaderRow(p, i) {
  const st = p.stats ?? {};
  const acc = pct(st.quizRight, st.quizTotal);
  const open = !p.self && openFriend === p.username;
  return `<li class="leader ${p.self ? "self" : ""}">
    <button type="button" class="leader-row" ${p.self ? "disabled" : `data-friend="${esc(p.username)}" aria-expanded="${open}"`}>
      <span class="rank">${i + 1}</span>
      <span class="avatar" aria-hidden="true">${esc(initials(p))}</span>
      <span class="who"><strong>${esc(fullName(p))}${p.self ? " <em>(tu)</em>" : ""}</strong>
        <small>@${esc(p.username)} · ${days(streakOf(st))} di fila · ${st.read ?? 0} ${st.read === 1 ? "scheda" : "schede"} · ${acc === null ? "–" : `${acc}%`} quiz</small></span>
      <span class="pts"><b>${st.points ?? 0}</b><small>punti</small></span>
    </button>
    ${open ? compareBlock(p) : ""}
  </li>`;
}

function compareBlock(friend) {
  const a = computeStats(state);
  const b = friend.stats ?? {};
  const metric = (label, x, y, suffix = "") => {
    const xs = x ?? "–";
    const ys = y ?? "–";
    const win = typeof x === "number" && typeof y === "number" ? (x > y ? "a" : y > x ? "b" : "") : "";
    return `<tr><th scope="row">${label}</th><td class="${win === "a" ? "win" : ""}">${xs}${x == null ? "" : suffix}</td><td class="${win === "b" ? "win" : ""}">${ys}${y == null ? "" : suffix}</td></tr>`;
  };
  const cats = CATS.map((c) => {
    const pa = pct(a.byCat?.[c]?.right, a.byCat?.[c]?.total);
    const pb = pct(b.byCat?.[c]?.right, b.byCat?.[c]?.total);
    return `<div class="duel" data-cat="${c}"><span>${CAT_SHORT[c]}</span>
      <span class="duel-bars"><i style="width:${pa ?? 0}%"></i><i class="them" style="width:${pb ?? 0}%"></i></span>
      <span class="duel-val">${pa ?? "–"} / ${pb ?? "–"}</span></div>`;
  }).join("");
  return `<div class="compare">
    <table>
      <thead><tr><th></th><th scope="col">Tu</th><th scope="col">${esc(friend.first_name)}</th></tr></thead>
      <tbody>
        ${metric("Punti", a.points, b.points)}
        ${metric("Giorni di fila", streakOf(a), streakOf(b))}
        ${metric("Schede lette", a.read, b.read)}
        ${metric("Risposte giuste", pct(a.quizRight, a.quizTotal), pct(b.quizRight, b.quizTotal), "%")}
        ${metric("Routine completate", a.routineDays, b.routineDays)}
      </tbody>
    </table>
    ${commonInterests(friend)}
    <p class="duel-legend"><span class="key you"></span>Tu <span class="key them"></span>${esc(friend.first_name)} · risposte giuste per tema (%)</p>
    <div class="duels">${cats}</div>
    <button type="button" class="link-btn" data-unfriend="${esc(friend.username)}">Rimuovi dal confronto</button>
  </div>`;
}

function commonInterests(friend) {
  const theirs = new Set(friend.stats?.interests ?? []);
  const shared = state.interests.filter((i) => theirs.has(i));
  if (!theirs.size) return "";
  return `<div class="shared"><span class="shared-label">${shared.length ? `Interessi in comune (${shared.length})` : "Nessun interesse in comune, per ora"}</span>
    <div class="chips small">${shared.map((i) => `<span class="chip on">${esc(INTEREST_LABEL[i] ?? i)}</span>`).join("")}</div></div>`;
}

function interestChips(selected, attr) {
  return INTERESTS.map(
    ([id, label]) =>
      `<button type="button" class="chip" ${attr}="${id}" aria-pressed="${selected.includes(id)}">${esc(label)}</button>`,
  ).join("");
}

function renderInterests() {
  $("#my-interests").innerHTML = `<p class="tip">Servono per trovare persone con i tuoi stessi interessi. Le notizie del mattino restano uguali per tutti.</p>
    <div class="chips">${interestChips(state.interests, "data-interest")}</div>`;
}

function toggleInterest(list, id) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// Shown after sign-up, or at sign-in for a profile that has never picked any.
let draftInterests = [];
function showInterestsStep() {
  draftInterests = [...state.interests];
  $("#login").hidden = false;
  $("#app").setAttribute("aria-hidden", "true");
  $("#login-step").hidden = true;
  $("#interests-step").hidden = false;
  $("#interests-hello").textContent = `Ciao ${me.first_name}, cosa ti interessa?`;
  renderInterestsStep();
}

function renderInterestsStep() {
  $("#interest-picker").innerHTML = interestChips(draftInterests, "data-pick-interest");
  const n = draftInterests.length;
  const done = $("#interests-done");
  done.disabled = n < MIN_INTERESTS;
  done.textContent = n < MIN_INTERESTS ? `Scegline ancora ${MIN_INTERESTS - n}` : `Continua con ${n} temi`;
}

function closeInterestsStep(save) {
  if (save) {
    state.interests = draftInterests;
    persist();
  }
  $("#interests-step").hidden = true;
  $("#login-step").hidden = false;
  $("#login").hidden = true;
  $("#app").removeAttribute("aria-hidden");
  route();
}

// Interests chosen in advance for a profile (config/presets.json), applied once.
async function applyPreset() {
  try {
    const res = await fetch("config/presets.json", { cache: "no-cache" });
    const preset = res.ok ? (await res.json())[me.username] : null;
    if (preset?.interests?.length) {
      state.interests = preset.interests.filter((i) => INTEREST_LABEL[i]);
      persist();
      return true;
    }
  } catch {
    /* no presets */
  }
  return false;
}

async function ensureInterests() {
  if (!me || state.interests.length) return;
  if (await applyPreset()) {
    toast("Ho impostato i tuoi interessi: puoi cambiarli in Progressi");
    route();
  } else {
    showInterestsStep();
  }
}

async function searchFriends(q) {
  const box = $("#friend-results");
  if (!box) return;
  if (q.trim().length < 2) {
    box.innerHTML = "";
    return;
  }
  let hits = [];
  try {
    hits = (await backend.search(q)).filter((p) => p.username !== me.username);
  } catch (err) {
    box.innerHTML = `<li class="empty">${esc(err.message)}</li>`;
    return;
  }
  box.innerHTML = hits.length
    ? hits
        .map((p) => {
          const added = state.friends.includes(p.username);
          return `<li><span class="avatar" aria-hidden="true">${esc(initials(p))}</span>
            <span class="who"><strong>${esc(fullName(p))}</strong><small>@${esc(p.username)}</small></span>
            <button type="button" class="btn ${added ? "ghost" : "tint"}" data-add-friend="${esc(p.username)}" ${added ? "disabled" : ""}>${added ? "Già aggiunto" : "Confronta"}</button></li>`;
        })
        .join("")
    : `<li class="empty">Nessuno trovato con "${esc(q.trim())}".</li>`;
}

// ---------- sign in ----------

function showLogin(tab = "entra") {
  $("#login").hidden = false;
  $("#login-step").hidden = false;
  $("#interests-step").hidden = true;
  $("#app").setAttribute("aria-hidden", "true");
  $("#login-mode").textContent =
    backend?.mode === "cloud"
      ? "I profili sono condivisi: puoi entrare da qualsiasi dispositivo."
      : "Modalità locale: i profili restano su questo dispositivo.";
  setLoginTab(tab);
}

function setLoginTab(tab) {
  const register = tab === "registrati";
  $("#tab-entra").setAttribute("aria-selected", String(!register));
  $("#tab-registrati").setAttribute("aria-selected", String(register));
  $("#register-fields").hidden = !register;
  $("#login-submit").textContent = register ? "Crea il profilo" : "Entra";
  $("#login-error").textContent = "";
  $("#first-name").required = register;
  $("#last-name").required = register;
  $("#login-form").dataset.mode = tab;
}

function enterAs(profile, remote) {
  me = { username: profile.username, first_name: profile.first_name, last_name: profile.last_name };
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(me));
  } catch {
    /* remembered for this session only */
  }
  const local = readState(userKey(me.username));
  const cloud = remote?.state && remote.state.updatedAt ? remote.state : null;
  if (cloud && (!local || cloud.updatedAt > local.updatedAt)) {
    replaceState({ ...cloud, answers: local?.answers ?? {}, settings: { ...cloud.settings, apiKey: local?.settings.apiKey ?? "" } });
    saveLocal();
  } else if (local) {
    replaceState(local);
  } else {
    replaceState(defaults());
  }
  pendingImport = hasProgress(state) ? null : findLocalProgress();
  persist();
  $("#login").hidden = true;
  $("#app").removeAttribute("aria-hidden");
  applySettings();
  if (edition) {
    renderToday(); // the masthead ring belongs to every view
    route();
  }
  ensureInterests();
}

// ---------- moving progress between profiles on one device ----------

const PROGRESS_KEYS = ["read", "understood", "saved", "checklist", "activity", "quiz", "catStats", "answers", "review"];
const hasProgress = (s) => Object.keys(s.read ?? {}).length > 0 || Object.keys(s.quiz ?? {}).length > 0;
let pendingImport = null; // { from, state } offered to a profile that starts empty

// Progress on this device that a profile starting from zero may want to keep.
function findLocalProgress() {
  const found = [];
  try {
    const legacy = readState(LEGACY_KEY);
    if (legacy && hasProgress(legacy)) found.push({ from: null, state: legacy });
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key.startsWith("cinque:v1:u:") || key === userKey(me.username)) continue;
      const other = readState(key);
      if (other && hasProgress(other)) found.push({ from: key.slice("cinque:v1:u:".length), state: other });
    }
  } catch {
    /* storage unavailable */
  }
  return found.sort((a, b) => (b.state.updatedAt ?? 0) - (a.state.updatedAt ?? 0))[0] ?? null;
}

function importProgress() {
  const { from, state: source } = pendingImport;
  for (const k of PROGRESS_KEYS) state[k] = structuredClone(source[k] ?? defaults()[k]);
  pendingImport = null;
  persist();
  if (from === null) {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* already gone */
    }
  }
  renderToday();
  toast("Progressi spostati nel tuo profilo");
}

// Picks up progress made on another device since this one last synced.
async function refreshFromCloud() {
  if (backend?.mode !== "cloud" || !me) return;
  try {
    const remote = await backend.getPlayer(me.username);
    if (!remote) {
      // Profile created while the app was in local mode: publish it now.
      await backend.createPlayer(me).catch((err) => {
        if (!(err instanceof BackendError && err.code === "taken")) throw err;
      });
      return syncNow();
    }
    if (remote.state?.updatedAt > state.updatedAt) {
      replaceState({ ...remote.state, answers: state.answers, settings: { ...remote.state.settings, apiKey: state.settings.apiKey } });
      saveLocal();
      applySettings();
      renderToday();
      route();
    } else if (state.updatedAt > (remote.state?.updatedAt ?? 0)) {
      syncNow();
    }
  } catch {
    /* offline: keep local progress */
  }
}

async function submitLogin(e) {
  e.preventDefault();
  const mode = $("#login-form").dataset.mode;
  const error = $("#login-error");
  const username = normalizeUsername($("#username").value);
  error.textContent = "";
  if (!validUsername(username)) {
    error.textContent = "Lo username deve avere da 3 a 20 caratteri: lettere minuscole, numeri, punto o trattino basso.";
    return;
  }
  const btn = $("#login-submit");
  btn.disabled = true;
  try {
    if (mode === "registrati") {
      const first_name = $("#first-name").value.trim().slice(0, 40);
      const last_name = $("#last-name").value.trim().slice(0, 40);
      if (!first_name || !last_name) {
        error.textContent = "Inserisci nome e cognome.";
        return;
      }
      const profile = await backend.createPlayer({ username, first_name, last_name });
      enterAs(profile, null);
      toast(`Benvenuto, ${first_name}`);
    } else {
      const remote = await backend.getPlayer(username);
      if (!remote) {
        error.textContent = `Non trovo @${username}. Controlla lo username oppure registrati.`;
        return;
      }
      enterAs(remote, remote);
      toast(`Bentornato, ${remote.first_name}`);
    }
  } catch (err) {
    error.textContent = err instanceof BackendError ? err.message : "Qualcosa è andato storto. Riprova.";
  } finally {
    btn.disabled = false;
  }
}

async function logout() {
  await syncNow();
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* nothing remembered */
  }
  me = null;
  replaceState(defaults());
  applySettings();
  $("#login-form").reset();
  showLogin("entra");
}

function quizChart(days) {
  const w = 320;
  const h = 150;
  const pad = { l: 30, r: 8, t: 10, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const slot = iw / days.length;
  const bw = Math.min(18, slot * 0.6);
  const y = (pct) => pad.t + ih - (pct / 100) * ih;
  const grid = [0, 50, 100]
    .map((p) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(p)}" y2="${y(p)}" stroke="var(--line)" stroke-width="1"/><text x="${pad.l - 6}" y="${y(p) + 3}" text-anchor="end">${p}%</text>`)
    .join("");
  const bars = days
    .map(([date, q], i) => {
      const pct = q.total ? (q.score / q.total) * 100 : 0;
      const x = pad.l + slot * i + (slot - bw) / 2;
      const last = i === days.length - 1;
      return `<rect x="${x.toFixed(1)}" y="${y(pct).toFixed(1)}" width="${bw.toFixed(1)}" height="${(pad.t + ih - y(pct)).toFixed(1)}" rx="3" fill="${last ? "var(--ink)" : "var(--muted)"}" opacity="${last ? 1 : 0.55}"><title>${shortDate(date)}: ${q.score}/${q.total}</title></rect>
        <text x="${(x + bw / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle">${shortDate(date)}</text>`;
    })
    .join("");
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Punteggio dei quiz negli ultimi giorni">${grid}${bars}</svg>`;
}

function renderSettings() {
  const t = $(`#theme-${state.settings.theme}`);
  if (t) t.checked = true;
  const f = { "0.94": "s", "1": "m", "1.12": "l" }[state.settings.font] ?? "m";
  $(`#font-${f}`).checked = true;
  $("#api-key").value = state.settings.apiKey;
  $("#key-status").textContent = state.settings.apiKey ? "Chiave salvata su questo dispositivo." : "";
}

// ---------- router ----------

const VIEWS = ["oggi", "quiz", "archivio", "progressi"];
function route() {
  const name = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "oggi";
  for (const v of VIEWS) {
    $(`#view-${v}`).hidden = v !== name;
    const tab = $(`#tab-${v}`);
    if (v === name) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  if (!edition || !me) return;
  if (name === "oggi") renderToday();
  if (name === "quiz") renderQuiz();
  if (name === "archivio") renderArchive();
  if (name === "progressi") {
    renderStats();
    renderInterests();
    renderFriends();
    renderSettings();
  }
}

// ---------- events ----------

document.addEventListener("click", (e) => {
  const t = e.target.closest("button, a");
  if (!t) return;
  if (!t.classList.contains("term")) $("#termpop").hidden = true;
  if (t.classList.contains("term")) {
    showTerm(Number(t.dataset.term));
  } else if (t.dataset.next) {
    const card = findCard(t.dataset.next);
    if (card) openSheet(card, { push: false });
  } else if (t.hasAttribute("data-copy-action")) {
    navigator.clipboard
      .writeText(plain(openCard.actionToday))
      .then(() => toast("Copiato"))
      .catch(() => toast("Copia non riuscita: seleziona il testo a mano"));
  } else if (t.hasAttribute("data-stories")) {
    openStories(Number(t.dataset.stories) || 0);
  } else if (t.id === "stories-close") {
    closeStories();
  } else if (t.dataset.storyRead) {
    const card = findCard(t.dataset.storyRead);
    closeStories();
    if (card) openSheet(card);
  } else if (t.dataset.open) {
    const card = findCard(t.dataset.open);
    if (card) openSheet(card);
  } else if (t.dataset.openDay) {
    showDay(t.dataset.openDay, t.dataset.openId ?? null);
  } else if (t.id === "back-today") {
    showDay(latest.date);
  } else if (t.id === "sheet-close") {
    history.state?.sheet ? history.back() : closeSheet();
  } else if (t.id === "sheet-listen") {
    toggleSpeak();
  } else if (t.id === "sheet-save") {
    const card = openCard;
    if (state.saved[card.id]) delete state.saved[card.id];
    else state.saved[card.id] = { title: card.title, category: card.category, date: edition.date };
    persist();
    t.setAttribute("aria-pressed", String(Boolean(state.saved[card.id])));
    toast(state.saved[card.id] ? "Salvata nell'archivio" : "Rimossa dai salvati");
  } else if (t.dataset.understood) {
    const yes = t.dataset.understood === "yes";
    state.understood[openCard.id] = yes;
    markRead(openCard);
    persist();
    renderToday();
    $("#eli5").hidden = yes;
    if (yes) toast("Segnata come capita");
    else $("#eli5").scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (t.dataset.quizCard) {
    startQuiz(t.dataset.quizCard);
  } else if (t.hasAttribute("data-start-quiz")) {
    startQuiz();
  } else if (t.dataset.pick !== undefined) {
    pick(Number(t.dataset.pick));
  } else if (t.id === "next-q") {
    nextQuestion();
  } else if (t.dataset.send) {
    const key = t.dataset.send;
    if (key.startsWith("refl-")) {
      const box = document.querySelector(`[data-chat="${CSS.escape(key)}"]`);
      const card = findCard(box.dataset.card);
      const ta = $("textarea", box);
      const answer = ta.value.trim();
      if (!answer) return ta.focus();
      if (!chats.has(key)) {
        state.answers[card.id] = answer;
        persist();
        return sendToClaude(key, reflectionQuestion(card, answer));
      }
    }
    sendToClaude(key);
  } else if (t.dataset.copy) {
    copyQuestion(t.dataset.copy);
  } else if (t.id === "reset") {
    $("#reset-row").innerHTML = `<span class="hint">Cancellare letture, quiz e salvati da questo dispositivo?</span>
      <button type="button" class="btn" id="reset-yes">Sì, azzera</button><button type="button" class="btn ghost" id="reset-no">Annulla</button>`;
  } else if (t.id === "reset-yes") {
    replaceState({ settings: state.settings, friends: state.friends });
    persist();
    toast("Progressi azzerati");
    route();
    $("#reset-row").innerHTML = '<button type="button" class="btn ghost" id="reset">Azzera progressi</button>';
  } else if (t.id === "reset-no") {
    $("#reset-row").innerHTML = '<button type="button" class="btn ghost" id="reset">Azzera progressi</button>';
  } else if (t.id === "import-yes") {
    importProgress();
  } else if (t.id === "import-no") {
    pendingImport = null;
    renderToday();
  } else if (t.dataset.interest) {
    state.interests = toggleInterest(state.interests, t.dataset.interest);
    t.setAttribute("aria-pressed", String(state.interests.includes(t.dataset.interest)));
    persist();
  } else if (t.dataset.pickInterest) {
    draftInterests = toggleInterest(draftInterests, t.dataset.pickInterest);
    renderInterestsStep();
  } else if (t.id === "interests-done") {
    closeInterestsStep(true);
    toast("Interessi salvati");
  } else if (t.id === "interests-skip") {
    closeInterestsStep(false);
  } else if (t.id === "logout") {
    logout();
  } else if (t.dataset.friend) {
    openFriend = openFriend === t.dataset.friend ? null : t.dataset.friend;
    renderLeaderboard();
  } else if (t.dataset.addFriend) {
    state.friends = [...new Set([...state.friends, t.dataset.addFriend])];
    openFriend = t.dataset.addFriend;
    persist();
    $("#friend-q").value = "";
    $("#friend-results").innerHTML = "";
    renderLeaderboard();
    toast("Aggiunto al confronto");
  } else if (t.dataset.unfriend) {
    state.friends = state.friends.filter((u) => u !== t.dataset.unfriend);
    openFriend = null;
    persist();
    renderLeaderboard();
  } else if (t.id === "tab-entra" || t.id === "tab-registrati") {
    setLoginTab(t.id.slice(4));
  } else if (t.id === "ring") {
    location.hash = "#oggi";
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "friend-q") {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchFriends(e.target.value), 300);
    return;
  }
  const box = e.target.closest("[data-chat]");
  const link = box && $("[data-claude-link]", box);
  if (!link) return;
  const card = findCard(box.dataset.card);
  const typed = e.target.value.trim();
  link.href = claudeUrl(card, framedQuestion(box.dataset.chat, card, typed));
  if (box.dataset.chat.startsWith("refl-")) {
    state.answers[card.id] = typed;
    persist();
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.dataset.check !== undefined && openCard) {
    const list = (state.checklist[openCard.id] ??= openCard.checklist.map(() => false));
    list[Number(t.dataset.check)] = t.checked;
    state.activity[localDate()] = true;
    persist();
    if (list.every(Boolean)) toast("Routine completata. Bel lavoro.");
  } else if (t.name === "theme") {
    state.settings.theme = t.value;
    persist();
    applySettings();
  } else if (t.name === "font") {
    state.settings.font = t.value;
    persist();
    applySettings();
  }
});

$("#settings").addEventListener("submit", (e) => {
  e.preventDefault();
  const key = $("#api-key").value.trim();
  if (key && !key.startsWith("sk-ant-")) {
    $("#key-status").textContent = "La chiave deve iniziare con sk-ant-. Copiala di nuovo da platform.claude.com.";
    return;
  }
  state.settings.apiKey = key;
  persist();
  $("#key-status").textContent = key ? "Chiave salvata su questo dispositivo." : "Chiave rimossa.";
});

$("#login-form").addEventListener("submit", submitLogin);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && syncTimer) syncNow();
  if (document.visibilityState === "visible") refreshFromCloud();
});

$("#stories").addEventListener("click", (e) => {
  if (e.target.closest("button, a")) return;
  const r = $("#stories").getBoundingClientRect();
  storyStep(e.clientX - r.left < r.width * 0.3 ? -1 : 1);
});
$("#stories-bar").addEventListener("animationend", () => story && storyStep(1));
for (const ev of ["pointerdown", "pointerup", "pointercancel", "pointerleave"]) {
  $("#stories").addEventListener(ev, (e) => $("#stories").classList.toggle("paused", e.type === "pointerdown"));
}

document.addEventListener("keydown", (e) => {
  if (story) {
    if (e.key === "Escape") closeStories();
    if (e.key === "ArrowRight") storyStep(1);
    if (e.key === "ArrowLeft") storyStep(-1);
    return;
  }
  if (e.key === "Escape" && !$("#sheet").hidden) history.state?.sheet ? history.back() : closeSheet();
});
window.addEventListener("popstate", () => closeSheet());
$("#sheet").addEventListener("scroll", updateProgress, { passive: true });
document.addEventListener("click", (e) => {
  if (!e.target.closest("button, a, #termpop")) $("#termpop").hidden = true;
});
window.addEventListener("hashchange", () => {
  closeSheet();
  closeStories();
  route();
});

// ---------- boot ----------

async function boot() {
  applySettings();
  const connecting = connect().then((b) => (backend = b));
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    /* not signed in */
  }
  if (saved?.username) {
    enterAs(saved, null);
    connecting.then(refreshFromCloud);
  } else {
    await connecting;
    showLogin(localStorage.getItem(LEGACY_KEY) ? "registrati" : "entra");
  }
  try {
    [latest, index] = await Promise.all([fetchJson("data/latest.json"), fetchJson("data/index.json").catch(() => ({ days: [] }))]);
  } catch {
    $("#edition-meta").textContent = "Offline";
    $("#headline").textContent = "Non riesco a caricare l'edizione di oggi. Controlla la connessione e riapri l'app.";
    return;
  }
  if (!index.days.length) index.days = [{ date: latest.date, number: latest.number, headline: latest.headline, cards: latest.cards }];
  edition = latest;
  route();
}

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
