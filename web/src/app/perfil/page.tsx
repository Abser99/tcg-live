"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import { ordersApi, auctionsApi, paymentsApi, watchlistApi, messagesApi, type ApiOrder, type ApiBid, type WatchlistItem, type MessageThread } from "@/lib/api";
import {
  AUCTIONS, MY_BIDS, MY_ORDERS,
  type Order,
} from "@/lib/mock-data";

type Tab = "pujas" | "ordenes" | "watchlist" | "mensajes";

const TABS: { key: Tab; label: string }[] = [
  { key: "pujas",     label: "Mis Pujas"   },
  { key: "ordenes",   label: "Mis Órdenes" },
  { key: "watchlist", label: "Watchlist"   },
  { key: "mensajes",  label: "Mensajes"    },
];

const BID_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  ganando:   { label: "Ganando",   color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  perdiendo: { label: "Perdiendo", color: "#f87171", bg: "rgba(248,113,113,0.1)" },
  ganada:    { label: "Ganada",    color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  perdida:   { label: "Perdida",   color: "#71717a", bg: "rgba(113,113,122,0.1)" },
  active:    { label: "Activa",    color: "#4ade80", bg: "rgba(74,222,128,0.1)"  },
  won:       { label: "Ganada",    color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  lost:      { label: "Perdida",   color: "#71717a", bg: "rgba(113,113,122,0.1)" },
};

const ORDER_STATUS: Record<string, { label: string; icon: string; color: string }> = {
  pending_payment: { label: "Pendiente de pago", icon: "⏳", color: "#f59e0b" },
  pendiente_pago:  { label: "Pendiente de pago", icon: "⏳", color: "#f59e0b" },
  processing:      { label: "Procesando",         icon: "🔄", color: "#60a5fa" },
  shipped:         { label: "En camino",           icon: "🚚", color: "#a78bfa" },
  en_camino:       { label: "En camino",           icon: "🚚", color: "#a78bfa" },
  delivered:       { label: "Entregado",           icon: "✅", color: "#4ade80" },
  entregado:       { label: "Entregado",           icon: "✅", color: "#4ade80" },
};


// Set to true once Mercado Pago credentials are configured
const PAYMENTS_ENABLED = false;

async function initiateCheckout(orderId: string) {
  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? window.location.origin;
  const { data } = await paymentsApi.checkout(orderId, {
    success: `${webUrl}/pago/exitoso`,
    failure: `${webUrl}/pago/error`,
    pending: `${webUrl}/pago/pendiente`,
  });
  window.location.href = data.initPoint;
}

export default function PerfilPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pujas");

  // Real data
  const [realOrders,    setRealOrders]    = useState<ApiOrder[]      | null>(null);
  const [realBids,      setRealBids]      = useState<ApiBid[]        | null>(null);
  const [realWatchlist, setRealWatchlist] = useState<WatchlistItem[] | null>(null);
  const [realMessages,  setRealMessages]  = useState<MessageThread[] | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    setDataLoading(true);
    Promise.all([
      ordersApi.my().catch(() => null),
      auctionsApi.myBids().catch(() => null),
      watchlistApi.my().catch(() => null),
      messagesApi.threads().catch(() => null),
    ]).then(([ordersRes, bidsRes, watchlistRes, messagesRes]) => {
      if (ordersRes)    setRealOrders(ordersRes.data);
      if (bidsRes)      setRealBids(bidsRes.data);
      if (watchlistRes) setRealWatchlist(watchlistRes.data);
      if (messagesRes)  setRealMessages(messagesRes.data);
    }).finally(() => setDataLoading(false));
  }, [user]);

  async function handleCheckout(orderId: string) {
    setCheckingOut(orderId);
    try {
      await initiateCheckout(orderId);
    } catch {
      setCheckingOut(null);
    }
  }

  if (authLoading || !user) return null;

  const initials = user.username.slice(0, 2).toUpperCase();
  const orders: Order[] = realOrders
    ? realOrders.map((o) => ({
        id: o.id,
        item: o.items?.[0]?.cardName ?? "Carta",
        emoji: "🃏",
        gradient: "from-violet-600 to-indigo-800",
        glow: "rgba(139,92,246,0.4)",
        amount: o.totalAmount,
        status: (o.status as Order["status"]) ?? "pendiente_pago",
        date: new Date(o.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }),
        seller: o.seller?.username ?? "—",
        tracking: o.trackingNumber,
      }))
    : MY_ORDERS;

  const tabCounts: Record<Tab, number | undefined> = {
    pujas:     realBids?.length ?? MY_BIDS.length,
    ordenes:   orders.length,
    watchlist: realWatchlist?.length ?? 0,
    mensajes:  realMessages?.reduce((n, m) => n + (m.unreadCount ?? 0), 0) || undefined,
  };

  return (
    <div className="min-h-screen bg-[#0F0F14] text-white">
      <Navbar />

      <div className="pt-24 pb-0 border-b border-white/5">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="relative shrink-0">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black"
                style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 0 32px rgba(108,58,232,0.5)" }}
              >
                {initials}
              </div>
              <span
                className="absolute -bottom-1.5 -right-1.5 text-[10px] font-black px-2 py-0.5 rounded-full border border-[#0F0F14]"
                style={{ background: "#6C3AE8" }}
              >
                {user.role === "SELLER" ? "Vendedor" : "Comprador"}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-black">{user.username}</h1>
              <p className="text-zinc-500 text-sm mt-0.5">@{user.username} · {user.email}</p>
              <div className="flex flex-wrap items-center gap-5 mt-4">
                {[
                  { label: "Pujas",    value: realBids?.length  ?? MY_BIDS.length   },
                  { label: "Órdenes",  value: orders.length                          },
                  { label: "Watchlist",value: realWatchlist?.length ?? 0             },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-xl font-black">{s.value}</p>
                    <p className="text-[11px] text-zinc-500">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {user.role === "SELLER" && (
              <Link
                href="/vendedor"
                className="shrink-0 text-sm font-bold text-white px-5 py-2.5 rounded-xl transition-all"
                style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
              >
                Mi tienda →
              </Link>
            )}
          </div>

          <div className="flex items-center gap-1 mt-8 overflow-x-auto">
            {TABS.map((t) => {
              const active = tab === t.key;
              const count  = tabCounts[t.key];
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-semibold whitespace-nowrap transition-all border-b-2"
                  style={
                    active
                      ? { color: "#a78bfa", borderColor: "#6C3AE8", background: "rgba(108,58,232,0.08)" }
                      : { color: "#71717a", borderColor: "transparent" }
                  }
                >
                  {t.label}
                  {count !== undefined && count > 0 && (
                    <span
                      className="text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                      style={active ? { background: "rgba(108,58,232,0.3)", color: "#a78bfa" } : { background: "rgba(255,255,255,0.07)", color: "#71717a" }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8">
        {dataLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-[#6C3AE8] border-t-transparent animate-spin" />
          </div>
        )}

        {!dataLoading && (
          <>
            {/* ── MIS PUJAS ── */}
            {tab === "pujas" && (
              <div className="space-y-3">
                {(realBids ? realBids.map((bid) => {
                  const status = BID_STATUS[bid.status ?? "active"];
                  const isActive = bid.status === "active" || bid.status === "ganando";
                  return (
                    <div key={bid.id} className="flex items-center gap-4 rounded-2xl p-4" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="w-12 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl shrink-0" style={{ boxShadow: "0 0 16px rgba(139,92,246,0.4)" }}>
                        🃏
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{bid.item?.cardName ?? bid.auction?.title ?? "Carta"}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{bid.item?.condition ?? ""}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: status?.bg, color: status?.color }}>
                            {status?.label ?? bid.status}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-zinc-600 mb-0.5">Mi puja</p>
                        <p className="font-black text-base">${bid.amount.toLocaleString("es-MX")}</p>
                      </div>
                      {isActive && bid.auction && (
                        <Link href={`/auctions/${bid.auction.id}`} className="shrink-0 text-xs font-bold text-white px-4 py-2 rounded-xl" style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}>
                          Pujar →
                        </Link>
                      )}
                    </div>
                  );
                }) : MY_BIDS.map((bid) => {
                  const auction = AUCTIONS.find((a) => a.id === bid.auctionId)!;
                  const s = BID_STATUS[bid.status];
                  const isActive = bid.status === "ganando" || bid.status === "perdiendo";
                  return (
                    <div key={bid.auctionId} className="flex items-center gap-4 rounded-2xl p-4" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className={`w-12 h-16 rounded-xl bg-gradient-to-br ${auction.gradient} flex items-center justify-center text-xl shrink-0`} style={{ boxShadow: `0 0 16px ${auction.glow}` }}>
                        {auction.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{auction.name}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{auction.set} · {auction.condition}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                          {isActive && <span className="text-[11px] text-zinc-500 font-mono">{auction.timer}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-zinc-600 mb-0.5">Mi puja</p>
                        <p className="font-black text-base">${bid.myBid.toLocaleString("es-MX")}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">Actual: ${auction.currentBid.toLocaleString("es-MX")}</p>
                      </div>
                      {isActive && (
                        <Link href={`/auctions/${auction.id}`} className="shrink-0 text-xs font-bold text-white px-4 py-2 rounded-xl" style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}>
                          Pujar →
                        </Link>
                      )}
                    </div>
                  );
                }))}
              </div>
            )}

            {/* ── MIS ÓRDENES ── */}
            {tab === "ordenes" && (
              <div className="space-y-3">
                {orders.map((order) => {
                  const s = ORDER_STATUS[order.status] ?? { label: order.status, icon: "📋", color: "#71717a" };
                  const isPending = order.status === "pendiente_pago" || order.status === "pending_payment";
                  return (
                    <div key={order.id} className="rounded-2xl p-5" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-16 rounded-xl bg-gradient-to-br ${order.gradient} flex items-center justify-center text-xl shrink-0`} style={{ boxShadow: `0 0 16px ${order.glow}` }}>
                          {order.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-bold text-sm">{order.item}</p>
                            <span className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-xl" style={{ background: "rgba(255,255,255,0.05)", color: "#71717a" }}>
                              {typeof order.id === "string" && order.id.length > 12 ? order.id.slice(0, 8) + "…" : order.id}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">Vendedor: {order.seller} · {order.date}</p>
                          <div className="flex items-center gap-2 mt-3">
                            <span className="text-base">{s.icon}</span>
                            <span className="text-sm font-semibold" style={{ color: s.color }}>{s.label}</span>
                          </div>
                          {order.tracking && (
                            <p className="text-[11px] text-zinc-600 mt-1.5 font-mono">Rastreo: {order.tracking}</p>
                          )}
                          {isPending && (
                            PAYMENTS_ENABLED ? (
                              <button
                                onClick={() => handleCheckout(order.id)}
                                disabled={checkingOut === order.id}
                                className="mt-3 text-xs font-bold text-white px-4 py-2 rounded-xl disabled:opacity-60"
                                style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 4px 16px rgba(108,58,232,0.35)" }}
                              >
                                {checkingOut === order.id ? "Redirigiendo..." : `Pagar ahora — $${order.amount.toLocaleString("es-MX")} MXN`}
                              </button>
                            ) : (
                              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-500 px-1">
                                <span>🔒</span>
                                <span>Pago en línea próximamente — te contactaremos para coordinar</span>
                              </div>
                            )
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-black text-lg">${order.amount.toLocaleString("es-MX")}</p>
                          <p className="text-[10px] text-zinc-600 mt-0.5">MXN</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── WATCHLIST ── */}
            {tab === "watchlist" && (
              <div className="grid sm:grid-cols-2 gap-4">
                {(realWatchlist ?? []).length === 0 ? (
                  <div className="col-span-2 text-center py-16">
                    <p className="text-3xl mb-3">♡</p>
                    <p className="text-zinc-400 font-medium">Sin items en tu watchlist</p>
                    <p className="text-xs text-zinc-600 mt-1">Guarda subastas para no perderlas</p>
                  </div>
                ) : (realWatchlist ?? []).map((w) => {
                  const a = w.auction;
                  if (!a) return null;
                  return (
                    <Link key={w.id} href={`/auctions/${a.id}`}>
                      <div className="rounded-2xl p-4 flex items-center gap-4 hover:border-[#6C3AE8]/30 transition-all cursor-pointer" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="w-12 h-16 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-800 flex items-center justify-center text-xl shrink-0" style={{ boxShadow: "0 0 16px rgba(139,92,246,0.4)" }}>
                          🃏
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{a.title ?? a.name ?? "Subasta"}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{a.game ?? ""}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
                              SUBASTA
                            </span>
                            <span className="text-xs font-black">
                              ${(a.currentBid ?? a.startingBid ?? 0).toLocaleString("es-MX")}{" "}
                              <span className="text-zinc-600 font-normal text-[10px]">MXN</span>
                            </span>
                          </div>
                        </div>
                        <button onClick={(e) => e.preventDefault()} className="shrink-0 text-zinc-600 hover:text-red-400 transition-colors text-lg">♡</button>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* ── MENSAJES ── */}
            {tab === "mensajes" && (
              <div className="space-y-2">
                {(realMessages ?? []).length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-3xl mb-3">💬</p>
                    <p className="text-zinc-400 font-medium">Sin mensajes aún</p>
                    <p className="text-xs text-zinc-600 mt-1">Los mensajes con vendedores aparecerán aquí</p>
                  </div>
                ) : (realMessages ?? []).map((msg) => {
                  const initials = (msg.otherUser?.username ?? "?").slice(0, 2).toUpperCase();
                  const hasUnread = (msg.unreadCount ?? 0) > 0;
                  return (
                    <div key={msg.id} className="flex items-center gap-4 rounded-2xl p-4 hover:border-[#6C3AE8]/20 transition-all cursor-pointer" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black" style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa" }}>{initials}</div>
                        {hasUnread && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center" style={{ background: "#6C3AE8" }}>{msg.unreadCount}</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">{msg.otherUser?.username ?? "Usuario"}</p>
                        <p className="text-xs mt-1 truncate" style={{ color: hasUnread ? "#d4d4d8" : "#71717a" }}>
                          {msg.lastMessage?.content ?? "Sin mensajes"}
                        </p>
                      </div>
                      {msg.lastMessage?.createdAt && (
                        <p className="text-[11px] text-zinc-600 shrink-0">
                          {new Date(msg.lastMessage.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
