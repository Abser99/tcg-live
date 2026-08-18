import type { ApiAuction } from "./api";

/* Small in-memory cache of the last auctions list the user saw, so the live
   view can render it behind while you drag the live away (a peek at where you
   came back to). Module-level → survives client-side navigation. */
let cachedAuctions: ApiAuction[] = [];

export function setAuctionsCache(a: ApiAuction[]) {
  cachedAuctions = a.slice(0, 12);
}
export function getAuctionsCache(): ApiAuction[] {
  return cachedAuctions;
}
