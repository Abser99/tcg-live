/**
 * Card-number rules for the form: which brand is being typed, how many digits it
 * should end up with, and whether what's there so far can possibly be right.
 *
 * The server checks all of this again before saving — this copy exists so the field
 * can say "una American Express lleva 15 dígitos" while you type, instead of after a
 * round trip. Keep the two in step: the authority is backend/src/payment-methods/card.ts.
 */

export type CardBrand = "visa" | "mastercard" | "amex" | "discover" | "diners" | "other";

const BRAND_LENGTHS: Record<CardBrand, number[]> = {
  visa:       [13, 16, 19],
  mastercard: [16],
  amex:       [15],
  discover:   [16, 19],
  diners:     [14, 16, 19],
  other:      [13, 14, 15, 16, 17, 18, 19],
};

export const BRAND_LABEL: Record<CardBrand, string> = {
  visa: "Visa", mastercard: "Mastercard", amex: "American Express",
  discover: "Discover", diners: "Diners Club", other: "Tarjeta",
};

export function detectBrand(num: string): CardBrand {
  const n = num.replace(/\D/g, "");
  if (/^4/.test(n)) return "visa";
  if (/^3[47]/.test(n)) return "amex";
  if (/^5[1-5]/.test(n) || /^2(2[2-9]\d|[3-6]\d{2}|7[01]\d|720)/.test(n)) return "mastercard";
  if (/^6(011|5|4[4-9])/.test(n)) return "discover";
  if (/^3(0[0-5]|[68])/.test(n)) return "diners";
  return "other";
}

export function lengthsFor(num: string): number[] {
  return BRAND_LENGTHS[detectBrand(num)];
}

/** The most digits this brand will ever need — what to cap the input at. */
export function maxLengthFor(num: string): number {
  return Math.max(...lengthsFor(num));
}

export function luhnOk(num: string): boolean {
  const n = num.replace(/\D/g, "");
  if (!n) return false;
  let sum = 0, double = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = n.charCodeAt(i) - 48;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Group digits the way the card is printed — Amex is 4-6-5, everything else 4-4-4-4 —
 * so what's on screen matches what's in your hand while you copy it across.
 */
export function formatCardNumber(raw: string): string {
  const n = raw.replace(/\D/g, "").slice(0, maxLengthFor(raw));
  const groups = detectBrand(n) === "amex" ? [4, 6, 5] : [4, 4, 4, 4, 4];
  const out: string[] = [];
  let i = 0;
  for (const g of groups) {
    if (i >= n.length) break;
    out.push(n.slice(i, i + g));
    i += g;
  }
  return out.join(" ");
}

/** MM/AA as you type: the slash appears on its own and can't be typed twice. */
export function formatExpiry(raw: string): string {
  let n = raw.replace(/\D/g, "").slice(0, 4);
  // A first digit above 1 can only be a single-digit month, so 5 becomes 05 and the
  // slash lands where the person expects instead of reading "5/26" as month 52.
  if (n.length === 1 && Number(n) > 1) n = `0${n}`;
  return n.length <= 2 ? n : `${n.slice(0, 2)}/${n.slice(2)}`;
}

export type CardIssue = { kind: "incomplete" | "invalid"; message: string } | null;

/** What to tell the person right now. Null once the number is good. */
export function cardIssue(raw: string): CardIssue {
  const n = raw.replace(/\D/g, "");
  if (!n) return { kind: "incomplete", message: "" };
  const brand = detectBrand(n);
  const lengths = BRAND_LENGTHS[brand];
  const max = Math.max(...lengths);

  if (n.length < max && !lengths.includes(n.length)) {
    const expected = lengths.length === 1 ? `${lengths[0]}` : lengths.join(" o ");
    return { kind: "incomplete", message: `${BRAND_LABEL[brand]} lleva ${expected} dígitos · ${n.length}` };
  }
  if (!lengths.includes(n.length)) {
    return { kind: "invalid", message: `${BRAND_LABEL[brand]} no lleva ${n.length} dígitos` };
  }
  if (!luhnOk(n)) return { kind: "invalid", message: "Revisa el número, algún dígito no cuadra" };
  return null;
}

/** How a saved card reads in a list: an asterisk and the last four. */
export function maskedCard(last4?: string | null): string {
  return last4 ? `*${last4}` : "*····";
}

/** MM/AA is in the past. Expiry is display-only here, but a dead card is worth flagging. */
export function expiryPassed(expiry?: string | null): boolean {
  if (!expiry || !/^\d{2}\/\d{2}$/.test(expiry)) return false;
  const [mm, yy] = expiry.split("/").map(Number);
  if (mm < 1 || mm > 12) return false;
  const now = new Date();
  const end = new Date(2000 + yy, mm, 1); // first instant after the expiry month
  return end <= now;
}
