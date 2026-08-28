/**
 * Card number rules. These sit between someone typing their card and a payment
 * processor rejecting it, so a wrong answer here is a failed purchase the person
 * can't diagnose. Numbers below are the standard published test cards — they pass
 * Luhn and belong to no account.
 */
import { checkCardNumber, detectBrand, lengthsFor, luhnOk, brandLabel } from './card';

describe('detectBrand', () => {
  it.each([
    ['4242424242424242', 'visa'],
    ['4111111111111111', 'visa'],
    ['5555555555554444', 'mastercard'],
    ['5105105105105100', 'mastercard'],
    ['2223003122003222', 'mastercard'],   // the 2-series range, easy to forget
    ['378282246310005',  'amex'],
    ['371449635398431',  'amex'],
    ['6011111111111117', 'discover'],
    ['30569309025904',   'diners'],
    ['9999999999999999', 'other'],
  ])('%s → %s', (num, brand) => {
    expect(detectBrand(num)).toBe(brand);
  });

  it('ignores the spaces people type', () => {
    expect(detectBrand('4242 4242 4242 4242')).toBe('visa');
  });
});

describe('luhnOk', () => {
  it.each(['4242424242424242', '5555555555554444', '378282246310005', '6011111111111117'])(
    'accepts the real check digit on %s', (n) => expect(luhnOk(n)).toBe(true),
  );

  it('rejects a single mistyped digit', () => {
    expect(luhnOk('4242424242424241')).toBe(false);
  });

  it('rejects an empty string rather than treating it as valid', () => {
    expect(luhnOk('')).toBe(false);
  });
});

describe('checkCardNumber — the whole gate', () => {
  it('accepts a valid card and reports its brand and last four', () => {
    expect(checkCardNumber('4242 4242 4242 4242')).toEqual({ ok: true, brand: 'visa', last4: '4242' });
  });

  it('accepts a 15-digit Amex', () => {
    expect(checkCardNumber('378282246310005')).toEqual({ ok: true, brand: 'amex', last4: '0005' });
  });

  it('rejects a 16-digit Amex, which the old 13-to-19 rule let through', () => {
    const r = checkCardNumber('3782822463100050');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('15 dígitos');
  });

  it('rejects a 15-digit Mastercard', () => {
    const r = checkCardNumber('555555555555444');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('16 dígitos');
  });

  it('names how many digits were typed, so the person can spot the missing one', () => {
    const r = checkCardNumber('424242424242424');   // one short
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('escribiste 15');
  });

  it('rejects letters', () => {
    const r = checkCardNumber('4242abcd42424242');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('solo lleva dígitos');
  });

  it('rejects a right-length number with a bad check digit', () => {
    const r = checkCardNumber('4242424242424241');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('no cuadra');
  });

  it('accepts hyphens, which people paste from their notes', () => {
    expect(checkCardNumber('4242-4242-4242-4242').ok).toBe(true);
  });

  it('rejects an empty field without crashing', () => {
    expect(checkCardNumber('').ok).toBe(false);
  });
});

describe('lengthsFor — what the form tells you to expect', () => {
  it('gives Amex 15 as its only length', () => expect(lengthsFor('3782')).toEqual([15]));
  it('gives Mastercard 16 as its only length', () => expect(lengthsFor('5555')).toEqual([16]));
  it('gives Visa its three', () => expect(lengthsFor('4242')).toEqual([13, 16, 19]));
});

describe('brandLabel', () => {
  it('spells out American Express rather than "amex"', () => {
    expect(brandLabel('amex')).toBe('American Express');
  });
});
