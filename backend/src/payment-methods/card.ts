/**
 * What a card number is allowed to look like. Kept dependency-free so it can be
 * tested on its own: the DTO's "13 to 19 digits" happily accepts a 16-digit Amex,
 * which does not exist, and a single mistyped digit sails straight through to the
 * payment processor where the error costs a round trip and a confusing failure.
 */

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'diners' | 'other';

/** Digit counts each brand actually issues. */
const BRAND_LENGTHS: Record<CardBrand, number[]> = {
  visa:       [13, 16, 19],
  mastercard: [16],
  amex:       [15],
  discover:   [16, 19],
  diners:     [14, 16, 19],
  other:      [13, 14, 15, 16, 17, 18, 19],
};

export function detectBrand(num: string): CardBrand {
  const n = num.replace(/\D/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^3[47]/.test(n)) return 'amex';
  // Mastercard took the 2221–2720 range on top of the classic 51–55.
  if (/^5[1-5]/.test(n) || /^2(2[2-9]\d|[3-6]\d{2}|7[01]\d|720)/.test(n)) return 'mastercard';
  if (/^6(011|5|4[4-9])/.test(n)) return 'discover';
  if (/^3(0[0-5]|[68])/.test(n)) return 'diners';
  return 'other';
}

/** The digit counts valid for whatever brand this number looks like. */
export function lengthsFor(num: string): number[] {
  return BRAND_LENGTHS[detectBrand(num)];
}

/** The check digit every issued card satisfies — catches most single-digit typos. */
export function luhnOk(num: string): boolean {
  const n = num.replace(/\D/g, '');
  if (!n) return false;
  let sum = 0;
  let double = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = n.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export type CardCheck =
  | { ok: true; brand: CardBrand; last4: string }
  | { ok: false; reason: string };

/**
 * Full check: digits only, a length the brand actually issues, and a valid check
 * digit. The message is what the person sees, so it says which of the three failed.
 */
export function checkCardNumber(raw: string): CardCheck {
  const n = (raw ?? '').replace(/[\s-]/g, '');
  if (!/^\d+$/.test(n)) return { ok: false, reason: 'El número de tarjeta solo lleva dígitos' };

  const brand = detectBrand(n);
  const lengths = BRAND_LENGTHS[brand];
  if (!lengths.includes(n.length)) {
    const expected = lengths.length === 1 ? `${lengths[0]}` : lengths.join(' o ');
    const named = brand === 'other' ? 'Esta tarjeta' : `Una ${brandLabel(brand)}`;
    return { ok: false, reason: `${named} lleva ${expected} dígitos, y escribiste ${n.length}` };
  }
  if (!luhnOk(n)) return { ok: false, reason: 'Revisa el número, algún dígito no cuadra' };

  return { ok: true, brand, last4: n.slice(-4) };
}

export function brandLabel(brand: CardBrand): string {
  return { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', discover: 'Discover', diners: 'Diners Club', other: 'Tarjeta' }[brand];
}
