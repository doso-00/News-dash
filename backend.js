// Where players live: Supabase when config/backend.json has a project URL and key,
// otherwise only on this device. Both expose the same functions.

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export const normalizeUsername = (s) => String(s ?? "").trim().replace(/^@/, "").toLowerCase();
export const validUsername = (s) => USERNAME_RE.test(s);

export class BackendError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // "taken" | "network" | "server"
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
    if (!res.ok) throw new BackendError("server", `Il database ha risposto con un errore (${res.status}). Riprova tra poco.`);
    return res.status === 204 ? null : res.json();
  }

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
  };
}
