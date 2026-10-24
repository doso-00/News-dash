// The interests people can pick. Shared by the app (browser) and the scripts (node).
// `family` only decides colour and icon of a card written for that interest.

export const INTERESTS = [
  { id: "ai", label: "Intelligenza artificiale", family: "ai" },
  { id: "tech", label: "Tecnologia", family: "ai" },
  { id: "code", label: "Programmazione e dati", family: "ai" },
  { id: "finanza", label: "Finanza e investimenti", family: "finanza" },
  { id: "economia", label: "Economia", family: "finanza" },
  { id: "politica", label: "Politica italiana", family: "mondo" },
  { id: "geopolitica", label: "Geopolitica", family: "mondo" },
  { id: "scienza", label: "Scienza", family: "sapere" },
  { id: "salute", label: "Salute e benessere", family: "routine" },
  { id: "sport", label: "Sport", family: "routine" },
  { id: "crescita", label: "Crescita personale", family: "routine" },
  { id: "produttivita", label: "Produttività", family: "routine" },
  { id: "psicologia", label: "Psicologia", family: "sapere" },
  { id: "storia", label: "Storia", family: "sapere" },
  { id: "cultura", label: "Libri e cultura", family: "sapere" },
  { id: "cinema", label: "Cinema e serie", family: "sapere" },
  { id: "musica", label: "Musica", family: "sapere" },
  { id: "viaggi", label: "Viaggi", family: "mondo" },
  { id: "clima", label: "Ambiente e clima", family: "mondo" },
  { id: "startup", label: "Imprenditoria e startup", family: "finanza" },
  { id: "lavoro", label: "Lavoro e carriera", family: "routine" },
  { id: "cucina", label: "Cucina", family: "sapere" },
];

export const INTEREST_IDS = INTERESTS.map((i) => i.id);
export const INTEREST_LABEL = Object.fromEntries(INTERESTS.map((i) => [i.id, i.label]));
export const INTEREST_FAMILY = Object.fromEntries(INTERESTS.map((i) => [i.id, i.family]));

// A card written for an interest comes in two kinds: today's news, or something to learn or try.
export const EXTRA_KINDS = ["news", "spunto"];
