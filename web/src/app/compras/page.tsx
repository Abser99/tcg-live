"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import { ordersApi, type ApiOrder } from "@/lib/api";

const STATUS: Record<string, { label: string; dot: string }> = {
  pending:   { label: "Pendiente de pago", dot: "#f59e0b" },
  confirmed: { label: "Pagado · preparando", dot: "var(--brand)" },
  shipped:   { label: "Enviado", dot: "var(--accent-text)" },
  delivered: { label: "Entregado", dot: "#22c55e" },
};

function money(cents?: number) {
  return `$${((cents ?? 0) / 100).toLocaleString("es-MX")}`;
}
function dateFmt(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

/* Pull-to-refresh: while scrolled to the very top, dragging down reveals a spinner and,
   past a threshold, runs onRefresh. Returns the current pull distance (px) + refreshing flag. */
const PULL_THRESHOLD = 68;
function usePullToRefresh(onRefresh: () => Promise<unknown> | void) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const st = useRef({ startY: 0, pulling: false, pull: 0, refreshing: false });
  const setP = (v: number) => { st.current.pull = v; setPull(v); };
  const setR = (v: boolean) => { st.current.refreshing = v; setRefreshing(v); };
  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      if (window.scrollY <= 0 && !st.current.refreshing) {
        st.current.startY = e.touches[0].clientY;
        st.current.pulling = true;
      } else st.current.pulling = false;
    };
    const onMove = (e: TouchEvent) => {
      if (!st.current.pulling || st.current.refreshing) return;
      const dy = e.touches[0].clientY - st.current.startY;
      if (dy > 0 && window.scrollY <= 0) {
        e.preventDefault();               // stop native scroll/overscroll while pulling
        setP(Math.min(120, dy * 0.5));    // damped travel
      } else if (dy <= 0) {
        st.current.pulling = false;
        setP(0);
      }
    };
    const onEnd = async () => {
      if (!st.current.pulling) return;
      st.current.pulling = false;
      if (st.current.pull >= PULL_THRESHOLD) {
        setR(true); setP(PULL_THRESHOLD);
        try { await onRefresh(); } finally { setR(false); setP(0); }
      } else setP(0);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [onRefresh]);
  return { pull, refreshing };
}

export default function ComprasPage() {
  const { user } = useAuth();
  const isSeller = (user?.role ?? "").toLowerCase() === "seller" || (user?.role ?? "").toLowerCase() === "admin";
  const [mode, setMode] = useState<"buying" | "selling">("buying");
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const req = mode === "selling" ? ordersApi.selling() : ordersApi.my();
    return req.then((r) => setOrders(r.data)).catch(() => { if (!silent) setOrders([]); })
      .finally(() => setLoading(false));
  }, [mode]);

  useEffect(() => { load(); }, [load]);

  // Pull down from the top to refresh (with a small spinner that appears as you pull).
  const { pull, refreshing } = usePullToRefresh(useCallback(() => load(true), [load]));

  // Keep purchases fresh without a hard reload: refresh when the tab regains focus (e.g. after
  // winning a lot in a live), and poll quietly while the page is visible.
  useEffect(() => {
    const refresh = () => { if (!document.hidden) load(true); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const id = setInterval(refresh, 20000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(id);
    };
  }, [load]);

  async function confirmReceived(id: string) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "delivered" } : o)));
    try { await ordersApi.markReceived(id); } catch { load(); }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />

      {/* Pull-to-refresh spinner — appears at the top as you drag the screen down */}
      <div className="fixed left-0 right-0 z-40 flex justify-center pointer-events-none"
        style={{ top: 74, opacity: (pull > 4 || refreshing) ? 1 : 0, transform: `translateY(${(refreshing ? PULL_THRESHOLD : pull) - PULL_THRESHOLD}px)`, transition: (refreshing || pull === 0) ? "transform 0.28s cubic-bezier(0.22,1,0.36,1), opacity 0.2s ease" : "opacity 0.12s ease" }}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ transform: `rotate(${refreshing ? 0 : Math.round(pull * 3)}deg)`, animation: refreshing ? "spin-slow 0.8s linear infinite" : undefined }}>
            <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
          </svg>
        </div>
      </div>

      <main id="main" className="mx-auto max-w-4xl px-6 pt-32 pb-20"
        style={{ transform: `translateY(${refreshing ? PULL_THRESHOLD : pull}px)`, transition: (refreshing || pull === 0) ? "transform 0.28s cubic-bezier(0.22,1,0.36,1)" : "none" }}>
        <div className="mb-2 text-[11px] font-medium uppercase" style={{ letterSpacing: "0.16em", color: "var(--text-muted)" }}>Tu actividad</div>
        <h1 className="text-4xl md:text-[2.75rem] font-medium tracking-[-0.025em]" style={{ color: "var(--text-primary)" }}>
          {mode === "selling" ? "Mis ventas" : "Mis compras"}
        </h1>

        {isSeller && (
          <div className="mt-7 inline-flex p-1 rounded-full" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            {(["buying", "selling"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
                style={mode === m
                  ? { background: "var(--brand-light)", color: "var(--brand-ink)" }
                  : { background: "transparent", color: "var(--text-muted)" }}>
                {m === "buying" ? "Compras" : "Ventas"}
              </button>
            ))}
          </div>
        )}

        <div className="mt-10 space-y-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl shimmer" style={{ border: "1px solid var(--border)" }} />
            ))
          ) : orders.length === 0 ? (
            <div className="text-center py-24 rounded-2xl" style={{ border: "1px solid var(--border-subtle)" }}>
              <p className="text-lg font-medium mb-1" style={{ color: "var(--text-primary)" }}>
                {mode === "selling" ? "Aún no tienes ventas" : "Aún no tienes compras"}
              </p>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                {mode === "selling" ? "Cuando alguien gane una de tus subastas, aparecerá aquí." : "Gana una subasta y tu pedido aparecerá aquí."}
              </p>
              <Link href="/auctions" className="inline-flex items-center gap-1.5 text-sm font-semibold px-5 py-2.5 rounded-full"
                style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>Ver subastas →</Link>
            </div>
          ) : (
            orders.map((o) => {
              const st = STATUS[o.status] ?? { label: o.status, dot: "var(--text-muted)" };
              const total = o.totalCents ?? o.totalAmount;
              const counter = mode === "selling" ? o.buyer?.username : o.seller?.username;
              const canConfirm = mode === "buying" && (o.status === "shipped");
              return (
                <div key={o.id} className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div className="inline-flex items-center gap-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} /> {st.label}
                      </div>
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{dateFmt(o.createdAt)}</span>
                    </div>

                    <div className="space-y-2.5">
                      {(o.items ?? []).map((it, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className="w-11 h-14 rounded-md overflow-hidden shrink-0 flex items-center justify-center"
                            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                            {it.imageUrls?.[0]
                              ? <img src={it.imageUrls[0]} alt="" className="h-full w-auto object-contain" />
                              : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--text-muted)" strokeWidth={1.3}><rect x="4" y="3" width="16" height="18" rx="2"/></svg>}
                          </div>
                          <span className="text-sm font-medium flex-1 min-w-0 truncate" style={{ color: "var(--text-primary)" }}>{it.cardName}</span>
                          <span className="text-sm font-medium tabular-nums" style={{ color: "var(--text-secondary)" }}>{money(it.finalPrice)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="px-5 py-3 flex items-center justify-between gap-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {counter && <>{mode === "selling" ? "Comprador" : "Vendedor"}: <span style={{ color: "var(--text-secondary)" }}>@{counter}</span> · </>}
                      Total <span className="font-medium" style={{ color: "var(--text-primary)" }}>{money(total)} MXN</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {o.auctionId && (
                        <Link href={`/auctions/${o.auctionId}/replay`} className="text-xs font-medium px-3 py-1.5 rounded-full"
                          style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}
                          title="Ver el momento exacto de tus pujas en la grabación">▶ Ver mi puja</Link>
                      )}
                      <Link href="/mensajes" className="text-xs font-medium px-3 py-1.5 rounded-full"
                        style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}>Mensajes</Link>
                      {canConfirm && (
                        <button onClick={() => confirmReceived(o.id)} className="text-xs font-semibold px-3 py-1.5 rounded-full"
                          style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>Confirmar recibido</button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}
