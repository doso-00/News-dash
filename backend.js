// Where players live: Supabase when config/backend.json has a project URL and key,
// otherwise only on this device. Both expose the same functions.

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export const normalizeUsername = (s) => String(s ?? "").trim().replace(/^@/, "").toLowerCase();
export const validUsername = (s) => USERNAME_RE.test(s);

export class BackendError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // "taken" | "network" | "server" | "rejected" | "missing"
  }
}

export async function connect() {
  let cfg = {};
  try {
    const res = await fetch("config/backend.json", { cache: "no-cache" });
    if (res.ok) cfg = await res.json();
  } catch {
    /* no config: stay local */
  }
  return cfg.supabaseUrl && cfg.supabaseKey ? cloud(cfg.supabaseUrl.replace(/\/$/, ""), cfg.supabaseKey) : local();
}

// ---------- Supabase (PostgREST over fetch) ----------

const PUBLIC_COLS = "username,first_name,last_name,stats,updated_at";

function cloud(url, key) {
  const headers = { apikey: key, "Content-Type": "application/json" };
  // Legacy anon keys are JWTs and also go in Authorization; publishable keys don't.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;

  async function call(path, init = {}) {
    let res;
    try {
      res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init.headers } });
    } catch {
      throw new BackendError("network", "Connessione non riuscita. Controlla la rete e riprova.");
    }
    if (res.status === 409) throw new BackendError("taken", "Questo username è già in uso: scegline un altro.");
    if (res.status === 404 && path.startsWith("rpc/")) {
      throw new BackendError("missing", "La discussione non è ancora attiva su questo database.");
    }
    if (res.status === 400 && path.startsWith("rpc/")) {
      // The chat functions refuse with a readable Italian message.
      const detail = await res.json().catch(() => null);
      if (detail?.message) throw new BackendError("rejected", detail.message);
    }
    if (!res.ok) throw new BackendError("server", `Il database ha risposto con un errore (${res.status}). Riprova tra poco.`);
    return res.status === 204 ? null : res.json();
  }

  const rpc = (name, args) => call(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });

  // Strips characters that have a meaning in PostgREST filters.
  const term = (s) => s.replace(/[,()*%\\"]/g, " ").trim();

  return {
    mode: "cloud",
    async getPlayer(username) {
      const rows = await call(`players?username=eq.${encodeURIComponent(username)}&select=${PUBLIC_COLS},state`);
      return rows[0] ?? null;
    },
    async createPlayer({ username, first_name, last_name }) {
      const rows = await call("players", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ username, first_name, last_name }),
      });
      return rows[0];
    },
    async savePlayer(username, { state, stats }) {
      await call(`players?username=eq.${encodeURIComponent(username)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ state, stats, updated_at: new Date().toISOString() }),
      });
    },
    async search(q) {
      const words = term(q).split(/\s+/).filter(Boolean).slice(0, 2);
      if (!words.length) return [];
      const like = (w) => `*${encodeURIComponent(w)}*`;
      const filters =
        words.length === 2
          ? `and(first_name.ilike.${like(words[0])},last_name.ilike.${like(words[1])})`
          : `username.ilike.${like(words[0])},first_name.ilike.${like(words[0])},last_name.ilike.${like(words[0])}`;
      return call(`players?select=username,first_name,last_name&or=(${filters})&order=username&limit=10`);
    },
    async getMany(usernames) {
      if (!usernames.length) return [];
      const list = usernames.map((u) => `"${u}"`).join(",");
      return call(`players?select=${PUBLIC_COLS}&username=in.(${encodeURIComponent(list)})`);
    },

    // ----- discussion inside each news item -----
    async names(usernames) {
      if (!usernames.length) return [];
      const list = usernames.map((u) => `"${u}"`).join(",");
      return call(`players?select=username,first_name,last_name&username=in.(${encodeURIComponent(list)})`);
    },
    rooms: (cardIds) => rpc("rooms", { p_cards: cardIds }),
    async messages(cardId, { after = 0, limit = 100 } = {}) {
      const base = `messages?card_id=eq.${encodeURIComponent(cardId)}&select=id,username,body,created_at,reports`;
      if (after) return call(`${base}&id=gt.${after}&order=id.asc&limit=${limit}`);
      return (await call(`${base}&order=id.desc&limit=${limit}`)).reverse();
    },
    async post(cardId, username, body, secret) {
      const rows = await rpc("post_message", { p_card: cardId, p_user: username, p_body: body, p_secret: secret });
      return { id: rows[0].msg_id, created_at: rows[0].msg_created_at };
    },
    remove: (id, secret) => rpc("delete_message", { p_id: id, p_secret: secret }),
    report: (id, reporter) => rpc("report_message", { p_id: id, p_reporter: reporter }),
    purge: () => rpc("purge_old_messages", {}),
  };
}

// ---------- this device only ----------

const REGISTRY_KEY = "cinque:players";

function local() {
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(REGISTRY_KEY)) ?? {};
    } catch {
      return {};
    }
  };
  const write = (all) => {
    try {
      localStorage.setItem(REGISTRY_KEY, JSON.stringify(all));
    } catch {
      /* storage full or blocked: the profile lives for this session only */
    }
  };
  const pub = ({ username, first_name, last_name, stats, updated_at }) => ({ username, first_name, last_name, stats, updated_at });

  return {
    mode: "local",
    async getPlayer(username) {
      return read()[username] ?? null;
    },
    async createPlayer({ username, first_name, last_name }) {
      const all = read();
      if (all[username]) throw new BackendError("taken", "Questo username è già in uso su questo dispositivo: scegline un altro.");
      const now = new Date().toISOString();
      all[username] = { username, first_name, last_name, stats: {}, created_at: now, updated_at: now };
      write(all);
      return all[username];
    },
    async savePlayer(username, { stats }) {
      const all = read();
      if (!all[username]) return;
      all[username] = { ...all[username], stats, updated_at: new Date().toISOString() };
      write(all);
    },
    async search(q) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      return Object.values(read())
        .filter((p) => words.every((w) => `${p.username} ${p.first_name} ${p.last_name}`.toLowerCase().includes(w)))
        .slice(0, 10)
        .map(pub);
    },
    async getMany(usernames) {
      const all = read();
      return usernames.filter((u) => all[u]).map((u) => pub(all[u]));
    },

    // ----- discussion inside each news item (people sharing this device) -----
    async names(usernames) {
      const all = read();
      return usernames.filter((u) => all[u]).map((u) => ({ username: u, first_name: all[u].first_name, last_name: all[u].last_name }));
    },
    async rooms(cardIds) {
      const players = Object.values(read());
      const chat = readChat();
      return cardIds.slice(0, 12).map((card_id) => {
        const msgs = chat.messages.filter((m) => m.card_id === card_id && m.reports < 2);
        return {
          card_id,
          people: players.filter((p) => (p.stats?.cards ?? []).includes(card_id)).length,
          messages: msgs.length,
          last_id: msgs.length ? Math.max(...msgs.map((m) => m.id)) : null,
        };
      });
    },
    async messages(cardId, { after = 0, limit = 100 } = {}) {
      const rows = readChat().messages.filter((m) => m.card_id === cardId);
      const view = rows.map(({ id, username, body, created_at, reports }) => ({ id, username, body, created_at, reports }));
      return after ? view.filter((m) => m.id > after).slice(0, limit) : view.slice(-limit);
    },
    async post(cardId, username, body, secret) {
      const text = String(body ?? "").trim();
      if (!text || text.length > 500) throw new BackendError("rejected", "Il messaggio deve avere da 1 a 500 caratteri.");
      const chat = readChat();
      const recent = chat.messages.filter((m) => m.username === username && Date.now() - Date.parse(m.created_at) < 60000);
      if (recent.length >= 6) throw new BackendError("rejected", "Troppi messaggi: aspetta un minuto.");
      const msg = { id: chat.next++, card_id: cardId, username, body: text, secret, reports: 0, reporters: [], created_at: new Date().toISOString() };
      chat.messages.push(msg);
      writeChat(chat);
      return { id: msg.id, created_at: msg.created_at };
    },
    async remove(id, secret) {
      const chat = readChat();
      const before = chat.messages.length;
      chat.messages = chat.messages.filter((m) => !(m.id === id && m.secret === secret));
      writeChat(chat);
      return chat.messages.length < before;
    },
    async report(id, reporter) {
      const chat = readChat();
      const m = chat.messages.find((x) => x.id === id);
      if (!m || m.username === reporter || m.reporters.includes(reporter)) return;
      m.reporters.push(reporter);
      m.reports = m.reporters.length;
      writeChat(chat);
    },
    async purge() {
      const chat = readChat();
      chat.messages = chat.messages.filter((m) => Date.now() - Date.parse(m.created_at) < 30 * 86400000);
      writeChat(chat);
    },
  };
}

const CHAT_KEY = "cinque:chat";
function readChat() {
  try {
    return JSON.parse(localStorage.getItem(CHAT_KEY)) ?? { next: 1, messages: [] };
  } catch {
    return { next: 1, messages: [] };
  }
}
function writeChat(chat) {
  try {
    localStorage.setItem(CHAT_KEY, JSON.stringify(chat));
  } catch {
    /* storage full or blocked */
  }
}
