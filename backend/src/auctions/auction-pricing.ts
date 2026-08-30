/**
 * Pure money/time rules for a lot — no DB, no DI, no side effects.
 *
 * Kept apart from AuctionsService so the rules that decide what a bidder pays and
 * how long they have to decide can be read (and tested) on their own.
 */

/** Bid step scales with the price: $20 → $50 over $400 → $100 over $1,000 → $200 over $5,000. */
export function bidIncrement(currentCents: number): number {
  if (currentCents >= 500_000) return 20_000; // $5,000+  → $200
  if (currentCents >= 100_000) return 10_000; // $1,000+  → $100
  if (currentCents >= 40_000)  return 5_000;  // $400+    → $50
  return 2_000;                               // under $400 → $20
}

/** Default lot length when the seller didn't pick one. */
export const ITEM_TIMER_MS = 60_000;

/** How long a lot runs once opened: the seller's chosen duration, else the default. */
export function itemDurationMs(item: { durationSec?: number | null }): number {
  const secs = item.durationSec;
  return secs && secs > 0 ? secs * 1000 : ITEM_TIMER_MS;
}

/**
 * Dutch price at a given moment. The price falls *linearly* from the item's start
 * price down to the floor across the whole lot window (dutchStartedAt → closesAt),
 * so the drop is spread evenly over the available time and lands exactly on the floor
 * when the timer ends. The seller only picks the floor; the rate is derived from time.
 */
export function dutchPriceAt(
  startPrice: number,
  dutchStartedAt: Date | null,
  closesAt: Date | null,
  floorCents: number,
  now = Date.now(),
): number {
  if (!dutchStartedAt) return startPrice;
  const floor = Math.min(Math.max(0, floorCents), startPrice); // floor can't exceed the start
  const total = closesAt ? closesAt.getTime() - dutchStartedAt.getTime() : 0;
  if (total <= 0) return floor;
  const progress = Math.min(1, Math.max(0, (now - dutchStartedAt.getTime()) / total));
  const raw = startPrice - (startPrice - floor) * progress;
  return Math.max(floor, Math.round(raw / 100) * 100); // snap to whole pesos
}
