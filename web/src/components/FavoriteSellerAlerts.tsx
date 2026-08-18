"use client";

/* Global watcher: pops an in-app toast the moment a FOLLOWED seller goes live.

   This is the *immediate, in-app* surface only. The scheduled "starts in ~1h" reminder
   lives on the server (auctions cron → notifications), so it reaches followers whether or
   not anyone has the page open — that rule must not be duplicated here.

   Dedup is persisted so the same live never toasts twice, even across reloads. */

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { auctionsApi, type ApiAuction } from "@/lib/api";
import { getFavoriteSellers } from "@/lib/seller-favorites";

const SEEN_KEY = "tcg_fav_live_seen"; // auction ids we've already toasted for
const POLL_MS = 45_000;

function readSeen(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function writeSeen(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(-300))); } catch { /* ignore */ }
}

type Toast = { id: string; auctionId: string; seller: string; title: string; sub: string };

export default function FavoriteSellerAlerts() {
  const router = useRouter();
  const [toasts, setToasts] = useState<Toast[]>([]);
  // First poll after mount just adopts the current live set silently, so we don't
  // spam alerts for lives that were already running when the page loaded.
  const firstRun = useRef(true);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const h = timers.current[id];
    if (h) { clearTimeout(h); delete timers.current[id]; }
  }, []);

  useEffect(() => {
    let stopped = false;

    function notify(title: string, body: string, tag: string, auctionId: string) {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const n = new Notification(title, { body, tag });
          n.onclick = () => { try { window.focus(); } catch { /* ignore */ } router.push(`/auctions/${auctionId}`); n.close(); };
        }
      } catch { /* ignore */ }
    }

    function pushToast(t: Toast, ttl = 10_000) {
      setToasts((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]));
      timers.current[t.id] = setTimeout(() => dismiss(t.id), ttl);
    }

    // A followed seller just went live
    function fireLive(a: ApiAuction) {
      const seller = a.seller?.username ?? a.sellerName ?? "Un vendedor";
      const auctionTitle = a.title ?? a.name ?? "Subasta en vivo";
      notify(`🔴 ${seller} está en vivo`, `${auctionTitle} — entra ahora`, `fav-live-${a.id}`, a.id);
      pushToast({ id: a.id, auctionId: a.id, seller, title: auctionTitle, sub: "Toca para entrar" });
    }

    async function check() {
      const favs = getFavoriteSellers();
      if (favs.length === 0) { firstRun.current = false; return; }
      try {
        const r = await auctionsApi.list({ page: 1, limit: 50 });
        if (stopped) return;
        const seen = new Set(readSeen(SEEN_KEY));
        const newlyLive: ApiAuction[] = [];
        for (const a of r.data.data) {
          if (a.status !== "live") continue;
          const seller = a.seller?.username ?? a.sellerName;
          if (!seller || !favs.includes(seller)) continue;
          if (seen.has(a.id)) continue;
          seen.add(a.id);
          if (!firstRun.current) newlyLive.push(a);
        }
        writeSeen(SEEN_KEY, [...seen]);
        firstRun.current = false;
        newlyLive.forEach(fireLive);
      } catch { /* ignore network hiccups */ }
    }

    check();
    const id = setInterval(check, POLL_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, [router, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed z-[80] flex flex-col gap-2 bottom-4 right-3 left-3 sm:left-auto sm:right-4 sm:w-[22rem]" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => { dismiss(t.id); router.push(`/auctions/${t.auctionId}`); }}
          className="text-left w-full rounded-2xl overflow-hidden flex items-center gap-3 px-4 py-3 shadow-lg transition-transform active:scale-[0.98]"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border-brand)", boxShadow: "0 10px 30px rgba(0,0,0,0.45)" }}
        >
          <span className="shrink-0 w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: "#ef4444" }} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
              🔴 {t.seller} está en vivo
            </span>
            <span className="block text-xs mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
              {t.sub}
            </span>
          </span>
          <span
            role="button"
            tabIndex={-1}
            aria-label="Descartar"
            onClick={(e) => { e.stopPropagation(); dismiss(t.id); }}
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-sm"
            style={{ color: "var(--text-muted)", background: "var(--bg-elevated)" }}
          >
            ✕
          </span>
        </button>
      ))}
    </div>
  );
}
