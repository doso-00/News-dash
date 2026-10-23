// Cinque al Mattino — client app. No build step: plain ES module.

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

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// ---------- storage ----------

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
  settings: { theme: "system", font: "1", apiKey: "" },
});

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return defaults();
    const saved = JSON.parse(raw);
    const base = defaults();
    return { ...base, ...saved, settings: { ...base.settings, ...saved.settings } };
  } catch {
    return defaults();
  }
}
const state = load();
function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: keep working in memory */
  }
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

function streak() {
  let day = localDate();
  if (!state.activity[day]) day = addDays(day, -1);
  let n = 0;
  while (state.activity[day]) {
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

  const s = streak();
  const quiz = state.quiz[edition.date];
  const due = dueReviews().length;
  $("#streak-row").innerHTML = [
    `<span class="pill ${s ? "on" : ""}"><strong>${s}</strong> ${s === 1 ? "giorno" : "giorni"} di fila</span>`,
    `<span class="pill ${quiz ? "on" : ""}">Quiz <strong>${quiz ? `${quiz.score}/${quiz.total}` : "da fare"}</strong></span>`,
    due ? `<span class="pill">Ripasso <strong>${due}</strong></span>` : "",
  ].join("");

  $("#cards").innerHTML = edition.cards
    .map((card, i) => {
      const [label, cls] = cardStatus(card);
      return `<li><button type="button" class="card ${i === 0 ? "lead" : ""}" data-cat="${card.category}" data-open="${esc(card.id)}">
        <span class="glyph"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[card.category]}</svg></span>
        <span class="card-top"><span class="card-label">${CAT_SHORT[card.category]} · ${card.readingMinutes} min</span><span class="status ${cls}">${label}</span></span>
        <h3 class="card-title">${esc(card.title)}</h3>
        <p class="card-summary">${esc(card.summary)}</p>
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

  $("#sheet-body").innerHTML = `
    <p class="eyebrow">${longDate(edition.date)}</p>
    <h2 id="sheet-title">${esc(card.title)}</h2>
    <p class="sheet-sub">${esc(card.subtitle)}</p>
    <div class="meta-row"><span>${card.readingMinutes} min di lettura</span>${card.sources.length ? `<span>${card.sources.length} fonti</span>` : ""}</div>
    <div class="prose">
      <p class="lede">${esc(card.summary)}</p>
      ${card.body.map((p) => `<p>${esc(p)}</p>`).join("")}
    </div>

    <section class="block"><h3>Punti chiave</h3>
      <ul class="points">${card.keyPoints.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
    </section>

    <section class="block">
      <div class="callout"><h3>Perché ti riguarda</h3><p>${esc(card.whyItMatters)}</p></div>
      <div class="callout"><h3>Da fare oggi</h3><p>${esc(card.actionToday)}</p></div>
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
    </section>`;

  sheet.hidden = false;
  sheet.scrollTop = 0;
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

// ---------- text to speech ----------

function stopSpeaking() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  $("#sheet-listen").classList.remove("speaking");
}

function toggleSpeak() {
  if (!("speechSynthesis" in window)) return toast("La lettura vocale non è disponibile su questo browser");
  if (speechSynthesis.speaking) return stopSpeaking();
  const card = openCard;
  const u = new SpeechSynthesisUtterance([card.title, card.summary, ...card.body, card.whyItMatters].join(". "));
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
${JSON.stringify({ titolo: card.title, sintesi: card.summary, testo: card.body, punti: card.keyPoints, glossario: card.glossary, fonti: card.sources })}`;
}

function promptForClaudeApp(card, question) {
  return `Sto studiando questo argomento: "${card.title}".
Sintesi: ${card.summary}
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
  const reads = Object.keys(state.read).length;
  const totals = Object.values(state.catStats).reduce((a, b) => ({ right: a.right + b.right, total: a.total + b.total }), { right: 0, total: 0 });
  const acc = totals.total ? Math.round((totals.right / totals.total) * 100) : null;
  const routineDays = Object.entries(state.checklist).filter(([id, list]) => id.endsWith("-routine") && list.length && list.every(Boolean)).length;

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
  if (!edition) return;
  if (name === "oggi") renderToday();
  if (name === "quiz") renderQuiz();
  if (name === "archivio") renderArchive();
  if (name === "progressi") {
    renderStats();
    renderSettings();
  }
}

// ---------- events ----------

document.addEventListener("click", (e) => {
  const t = e.target.closest("button, a");
  if (!t) return;
  if (t.dataset.open) {
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
    const settings = state.settings;
    Object.assign(state, defaults(), { settings });
    persist();
    toast("Progressi azzerati");
    route();
    $("#reset-row").innerHTML = '<button type="button" class="btn ghost" id="reset">Azzera progressi</button>';
  } else if (t.id === "reset-no") {
    $("#reset-row").innerHTML = '<button type="button" class="btn ghost" id="reset">Azzera progressi</button>';
  } else if (t.id === "ring") {
    location.hash = "#oggi";
  }
});

document.addEventListener("input", (e) => {
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

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("#sheet").hidden) history.state?.sheet ? history.back() : closeSheet();
});
window.addEventListener("popstate", () => closeSheet());
window.addEventListener("hashchange", () => {
  closeSheet();
  route();
});

// ---------- boot ----------

async function boot() {
  applySettings();
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
