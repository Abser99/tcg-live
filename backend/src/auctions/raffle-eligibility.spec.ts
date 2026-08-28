/**
 * Who can win a raffle. Getting this wrong hands a prize to someone who left, which
 * is announced in front of everyone and then has to be drawn again.
 */
import { raffleEligibility, presentCount, type AttendanceRow } from './raffle-eligibility';

const NOW = Date.parse('2026-08-28T18:00:00Z');
const PRESENT_WITHIN = 90;                       // seconds, matches the service
const secondsAgo = (s: number) => new Date(NOW - s * 1000);
const row = (userId: string, minutes: number, seenSecondsAgo: number): AttendanceRow => ({
  userId, watchedSec: minutes * 60, lastSeenAt: secondsAgo(seenSecondsAgo),
});

const check = (rows: AttendanceRow[], minMinutes = 5, sellerId = 'seller') =>
  raffleEligibility(rows, { minMinutes, sellerId, presentWithinSec: PRESENT_WITHIN, now: NOW });

describe('raffleEligibility — watching earns a place, being here keeps it', () => {
  it('includes someone who qualifies and is still watching', () => {
    const r = check([row('ana', 12, 5)]);
    expect(r.present.map(p => p.userId)).toEqual(['ana']);
  });

  it('excludes someone who earned their place and then left', () => {
    const r = check([row('ana', 12, 600)]);          // ten minutes since her last beat
    expect(r.qualified.map(q => q.userId)).toEqual(['ana']);   // she did earn it
    expect(r.present).toEqual([]);                              // but she isn't here
  });

  it('excludes someone present who has not watched long enough', () => {
    const r = check([row('kenji', 2, 5)], 5);
    expect(r.qualified).toEqual([]);
    expect(r.present).toEqual([]);
  });

  it('keeps someone whose beat is just inside the window', () => {
    expect(check([row('ana', 9, PRESENT_WITHIN - 1)]).present).toHaveLength(1);
  });

  it('drops someone whose beat is just outside it', () => {
    expect(check([row('ana', 9, PRESENT_WITHIN + 1)]).present).toHaveLength(0);
  });

  it('never lets the seller win their own raffle, present or not', () => {
    const r = check([row('seller', 90, 1), row('ana', 9, 1)]);
    expect(r.present.map(p => p.userId)).toEqual(['ana']);
  });

  it('excludes a row that never reported being seen at all', () => {
    const r = check([{ userId: 'ghost', watchedSec: 3600, lastSeenAt: null }]);
    expect(r.qualified.map(q => q.userId)).toEqual(['ghost']);
    expect(r.present).toEqual([]);
  });

  it('treats a minMinutes of 0 as 1, so a passer-by never wins', () => {
    const r = check([row('ana', 0, 1)], 0);
    expect(r.present).toEqual([]);
  });

  it('separates "nobody qualifies" from "the ones who did have left"', () => {
    const nobody = check([row('kenji', 1, 5)], 5);
    expect(nobody.qualified).toHaveLength(0);      // → "nadie alcanza el mínimo"

    const allGone = check([row('ana', 12, 900)], 5);
    expect(allGone.qualified).toHaveLength(1);     // → "ya salieron del live"
    expect(allGone.present).toHaveLength(0);
  });

  it('reports the minutes each person earned, for weighting the draw', () => {
    const r = check([row('ana', 12, 5), row('mia', 7, 5)]);
    expect(r.present).toEqual([
      { userId: 'ana', minutes: 12 },
      { userId: 'mia', minutes: 7 },
    ]);
  });

  it('handles an empty live', () => {
    expect(check([])).toEqual({ qualified: [], present: [] });
  });
});

describe('presentCount — the number on the raffle badge', () => {
  const count = (rows: AttendanceRow[], minMinutes = 1) =>
    presentCount(rows, { minMinutes, presentWithinSec: PRESENT_WITHIN, now: NOW });

  it('counts only the people still watching', () => {
    expect(count([row('ana', 5, 5), row('kenji', 5, 5), row('mia', 5, 600)])).toBe(2);
  });

  it('does not count someone below the bar', () => {
    expect(count([row('ana', 5, 5), row('kenji', 0, 5)], 1)).toBe(1);
  });

  it('is zero when everyone has gone', () => {
    expect(count([row('ana', 30, 3600), row('kenji', 30, 3600)])).toBe(0);
  });

  it('counts nobody in an empty live', () => {
    expect(count([])).toBe(0);
  });
});
