/**
 * Who is in the draw. Two separate conditions, and conflating them is what made
 * raffles need a second spin: watch time earns a place, but only someone still
 * watching can win it. Announcing a name that closed the tab an hour ago means
 * drawing again in front of everyone.
 *
 * Kept dependency-free so it can be tested on its own — it decides who gets a prize.
 */

export type AttendanceRow = {
  userId: string;
  watchedSec: number;
  lastSeenAt: Date | null;
};

export type Eligibility = {
  /** Cleared the watch-time bar, whether or not they are still here. */
  qualified: { userId: string; minutes: number }[];
  /** Cleared the bar and is still watching — the actual draw. */
  present: { userId: string; minutes: number }[];
};

export function raffleEligibility(
  rows: AttendanceRow[],
  opts: { minMinutes: number; sellerId: string; presentWithinSec: number; now?: number },
): Eligibility {
  const min = Math.max(1, opts.minMinutes);
  const cutoff = (opts.now ?? Date.now()) - opts.presentWithinSec * 1000;

  const qualified = rows
    // A seller drawing their own prize isn't a raffle.
    .filter(r => r.userId !== opts.sellerId)
    .map(r => ({ userId: r.userId, minutes: Math.floor(r.watchedSec / 60), lastSeenAt: r.lastSeenAt }))
    .filter(r => r.minutes >= min);

  const present = qualified.filter(r => r.lastSeenAt != null && r.lastSeenAt.getTime() >= cutoff);

  return {
    qualified: qualified.map(({ userId, minutes }) => ({ userId, minutes })),
    present: present.map(({ userId, minutes }) => ({ userId, minutes })),
  };
}

/** How many people are in the draw right now — the number the raffle badge shows. */
export function presentCount(
  rows: AttendanceRow[],
  opts: { minMinutes: number; presentWithinSec: number; now?: number },
): number {
  const min = Math.max(0, opts.minMinutes);
  const cutoff = (opts.now ?? Date.now()) - opts.presentWithinSec * 1000;
  return rows.filter(
    r => Math.floor(r.watchedSec / 60) >= min && r.lastSeenAt != null && r.lastSeenAt.getTime() >= cutoff,
  ).length;
}
