"use client";

/* Favorite ("followed") sellers.

   The server is the source of truth: /follows powers both the ♥ and the push
   notification the backend sends when a followed seller goes live, so a follow
   made on one device shows up on the next.

   localStorage mirrors that list so the UI can paint instantly (and so guests,
   who have no account to follow with, still get a working ♥ on this device).
   Components subscribe via the "fav-sellers-changed" window event. */

import { useEffect, useState, useCallback } from "react";
import { followsApi } from "@/lib/api";

const KEY = "tcg_fav_sellers";     // string[] of usernames
const ID_KEY = "tcg_fav_seller_ids"; // { [username]: sellerId } — needed to unfollow
const EVENT = "fav-sellers-changed";

function loggedIn(): boolean {
  return typeof window !== "undefined" && !!window.localStorage.getItem("tcg_token");
}

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore quota / private-mode errors */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

function readIds(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ID_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

/** Remember username → sellerId so a later unfollow knows which id to call. */
export function rememberSellerId(username: string, sellerId?: string) {
  if (!username || !sellerId || typeof window === "undefined") return;
  try {
    const map = readIds();
    if (map[username] === sellerId) return;
    map[username] = sellerId;
    window.localStorage.setItem(ID_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getFavoriteSellers(): string[] {
  return read();
}

export function isFavoriteSeller(username: string): boolean {
  return read().includes(username);
}

/** Pull the authoritative list from the server and mirror it locally. */
export async function syncFavoritesFromServer(): Promise<void> {
  if (!loggedIn()) return;
  try {
    const { data } = await followsApi.mine();
    const names = data.map((f) => f.username);
    try {
      const map = readIds();
      data.forEach((f) => { map[f.username] = f.sellerId; });
      window.localStorage.setItem(ID_KEY, JSON.stringify(map));
    } catch { /* ignore */ }
    write(names);
  } catch {
    /* offline or not authorised — keep whatever we have cached */
  }
}

/** Ask the browser for notification permission so we can alert when a followed
    seller's live is about to start. Safe anywhere; no-op if unsupported/decided. */
export function requestLiveAlertPermission(): void {
  try {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    /* ignore */
  }
}

/** Toggle a seller; returns the new favorite state (true = now favorited).
    Updates locally right away, then tells the server (when we know the id). */
export function toggleFavoriteSeller(username: string, sellerId?: string): boolean {
  if (!username || username === "—") return false;
  rememberSellerId(username, sellerId);
  const id = sellerId ?? readIds()[username];

  const list = read();
  const idx = list.indexOf(username);
  const nowFavorite = idx < 0;

  if (nowFavorite) list.push(username);
  else list.splice(idx, 1);
  write(list); // optimistic

  if (loggedIn() && id) {
    const req = nowFavorite ? followsApi.follow(id) : followsApi.unfollow(id);
    req.catch(() => {
      // Roll back so the ♥ never lies about what the server has.
      const cur = read();
      const at = cur.indexOf(username);
      if (nowFavorite && at >= 0) cur.splice(at, 1);
      else if (!nowFavorite && at < 0) cur.push(username);
      write(cur);
    });
  }
  return nowFavorite;
}

/** Reactive set of all favorite seller usernames. */
export function useFavoriteSellers(): string[] {
  const [list, setList] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setList(read());
    sync();
    void syncFavoritesFromServer(); // server wins
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync); // other tabs
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return list;
}

/** Reactive [isFavorite, toggle] for a single seller. */
export function useFavoriteSeller(username: string, sellerId?: string): [boolean, () => void] {
  const [fav, setFav] = useState(false);
  useEffect(() => {
    const sync = () => setFav(isFavoriteSeller(username));
    sync();
    rememberSellerId(username, sellerId);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [username, sellerId]);
  const toggle = useCallback(() => toggleFavoriteSeller(username, sellerId), [username, sellerId]);
  return [fav, toggle];
}
