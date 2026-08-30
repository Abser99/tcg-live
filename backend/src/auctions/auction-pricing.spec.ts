/**
 * Money and time rules for a lot. These decide what a bidder actually pays and
 * how long they have to decide, so a silent regression here is a real-money bug.
 */
import { bidIncrement, dutchPriceAt, itemDurationMs } from './auction-pricing';

const peso = (n: number) => n * 100; // pesos → cents, the unit everything is stored in

describe('bidIncrement — the step scales with the price', () => {
  it.each([
    ['under $400',   peso(0),     peso(20)],
    ['under $400',   peso(399),   peso(20)],
    ['at $400',      peso(400),   peso(50)],
    ['under $1,000', peso(999),   peso(50)],
    ['at $1,000',    peso(1_000), peso(100)],
    ['under $5,000', peso(4_999), peso(100)],
    ['at $5,000',    peso(5_000), peso(200)],
    ['well above',   peso(50_000), peso(200)],
  ])('%s: $%d → step $%d', (_label, price, expected) => {
    expect(bidIncrement(price)).toBe(expected);
  });

  it('never returns a step that is zero or negative', () => {
    for (const p of [0, 1, peso(399), peso(400), peso(1_000), peso(5_000), peso(1_000_000)]) {
      expect(bidIncrement(p)).toBeGreaterThan(0);
    }
  });
});

describe('itemDurationMs — the seller’s pick wins, else the 60s default', () => {
  it('uses the chosen duration', () => {
    expect(itemDurationMs({ durationSec: 300 })).toBe(300_000);
  });

  it('falls back to 60s when unset', () => {
    expect(itemDurationMs({ durationSec: null })).toBe(60_000);
    expect(itemDurationMs({})).toBe(60_000);
  });

  it('ignores nonsense values rather than opening a lot that closes instantly', () => {
    expect(itemDurationMs({ durationSec: 0 })).toBe(60_000);
    expect(itemDurationMs({ durationSec: -5 })).toBe(60_000);
  });
});

describe('dutchPriceAt — falls linearly from start to floor across the lot window', () => {
  const start = peso(800);
  const floor = peso(100);
  const t0 = new Date('2026-01-01T00:00:00Z');
  const t60 = new Date('2026-01-01T00:01:00Z'); // 60s window
  const at = (secs: number) => t0.getTime() + secs * 1000;

  it('is the full price at the very start', () => {
    expect(dutchPriceAt(start, t0, t60, floor, at(0))).toBe(start);
  });

  it('is halfway between start and floor at the midpoint', () => {
    expect(dutchPriceAt(start, t0, t60, floor, at(30))).toBe(peso(450));
  });

  it('lands exactly on the floor when the timer ends', () => {
    expect(dutchPriceAt(start, t0, t60, floor, at(60))).toBe(floor);
  });

  it('never goes below the floor, however late it is read', () => {
    expect(dutchPriceAt(start, t0, t60, floor, at(600))).toBe(floor);
  });

  it('never exceeds the start price if read before the clock began', () => {
    expect(dutchPriceAt(start, t0, t60, floor, at(-30))).toBe(start);
  });

  it('decreases monotonically — the price must never tick back up', () => {
    let prev = Infinity;
    for (let s = 0; s <= 60; s++) {
      const price = dutchPriceAt(start, t0, t60, floor, at(s));
      expect(price).toBeLessThanOrEqual(prev);
      prev = price;
    }
  });

  it('snaps to whole pesos so the shown price is the price charged', () => {
    for (let s = 0; s <= 60; s++) {
      expect(dutchPriceAt(start, t0, t60, floor, at(s)) % 100).toBe(0);
    }
  });

  it('holds at the start price while the descent has not been started', () => {
    expect(dutchPriceAt(start, null, t60, floor, at(30))).toBe(start);
  });

  it('clamps a floor set above the start price instead of inverting the auction', () => {
    const silly = peso(5_000); // floor > start
    const price = dutchPriceAt(start, t0, t60, silly, at(30));
    expect(price).toBe(start);
    expect(price).toBeLessThanOrEqual(start);
  });

  it('returns the floor when the window is zero-length or inverted', () => {
    expect(dutchPriceAt(start, t0, t0, floor, at(0))).toBe(floor);
    expect(dutchPriceAt(start, t60, t0, floor, at(0))).toBe(floor);
  });

  // The rounding-to-pesos step can land *below* a floor that isn't a whole peso
  // (e.g. $100.40 rounds to $100.00). Selling under the seller's minimum is a
  // real-money bug, so the floor must win over the rounding.
  it('never rounds down through a floor that has centavos', () => {
    const oddFloor = 10_040; // $100.40
    for (let sec = 0; sec <= 60; sec++) {
      const price = dutchPriceAt(start, t0, t60, oddFloor, at(sec));
      expect(price).toBeGreaterThanOrEqual(oddFloor);
    }
    expect(dutchPriceAt(start, t0, t60, oddFloor, at(60))).toBe(oddFloor);
  });

  it('returns the floor when there is no closing time to spread the drop over', () => {
    expect(dutchPriceAt(start, t0, null, floor, at(30))).toBe(floor);
  });
});
