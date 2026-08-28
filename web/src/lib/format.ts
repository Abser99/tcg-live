export function formatTimer(endTime?: string | Date): string {
  if (!endTime) return "—";
  const diff = new Date(endTime).getTime() - Date.now();
  if (diff <= 0) return "Finalizada";
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export const GAME_LABELS: Record<string, string> = {
  pokemon:    "Pokémon",
  mtg:        "Magic: The Gathering",
  yugioh:     "Yu-Gi-Oh!",
  onepiece:   "One Piece",
  lorcana:    "Disney Lorcana",
  dragonball: "Dragon Ball Super",
  sports:     "Sports Cards",
  other:      "Otro",
};

export function gameLabel(game?: string | null): string {
  if (!game) return "";
  return GAME_LABELS[game] ?? game;
}

// The Pokémon TCG API's cardmarket price is in USD/EUR, but every price in this
// app is MXN. This is a rough fixed reference rate (no live FX feed) — good
// enough for a starting-point suggestion the seller is expected to review, not
// for anything that skips human review.
const APPROX_USD_TO_MXN = 18.5;

export function usdCentsToMxnCents(usdCents: number): number {
  return Math.round(usdCents * APPROX_USD_TO_MXN);
}

/** What to call a live on screen: the seller's chosen name, else its permanent number.
    Kept in one place so every screen agrees after a rename. */
export function liveName(a?: { displayName?: string | null; title?: string; name?: string } | null): string {
  return a?.displayName?.trim() || a?.title || a?.name || "Sin título";
}

/** Pull the backend's message out of an axios error without reaching for `any`. */
export function apiMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg) && typeof msg[0] === "string") return msg[0]; // class-validator returns a list
  return fallback;
}
