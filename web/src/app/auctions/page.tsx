"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { auctionsApi, type ApiAuction } from "@/lib/api";
import { formatTimer } from "@/lib/format";

type Filter = "all" | "live" | "ending" | "upcoming";

const FILTERS: { key: Filter; label: string; dot?: string }[] = [
  { key: "all",     label: "Todas" },
  { key: "live",    label: "En vivo",      dot: "#ef4444" },
  { key: "ending",  label: "Por terminar", dot: "#f59e0b" },
  { key: "upcoming",label: "Próximas",     dot: "#6C3AE8" },
];

const STATUS_LABEL: Record<string, { text: string; bg: string; glow: string }> = {
  live:     { text: "EN VIVO",        bg: "#ef4444", glow: "rgba(239,68,68,0.4)" },
  ending:   { text: "TERMINA PRONTO", bg: "#f59e0b", glow: "rgba(245,158,11,0.3)" },
  upcoming: { text: "PRÓXIMO",        bg: "#6C3AE8", glow: "rgba(108,58,232,0.3)" },
};

const GRADIENTS = [
  "from-orange-500 to-red-600",
  "from-violet-600 to-indigo-800",
  "from-blue-500 to-cyan-400",
  "from-yellow-400 to-amber-500",
  "from-emerald-500 to-teal-600",
  "from-pink-500 to-rose-600",
  "from-indigo-500 to-purple-700",
  "from-lime-500 to-green-600",
];

const GLOWS = [
  "rgba(239,68,68,0.4)",
  "rgba(139,92,246,0.4)",
  "rgba(59,130,246,0.4)",
  "rgba(251,191,36,0.4)",
  "rgba(16,185,129,0.4)",
  "rgba(244,63,94,0.4)",
  "rgba(99,102,241,0.4)",
  "rgba(132,204,22,0.4)",
];


export default function AuctionsPage() {
  const [auctions, setAuctions] = useState<ApiAuction[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<Filter>("all");
  const [search, setSearch]     = useState("");
  const [, setTick] = useState(0);

  function applyResponse(res: { data: ApiAuction[]; total: number; page: number }) {
    if (res.page === 1) {
      setAuctions(res.data);
    } else {
      setAuctions(prev => {
        const existing = new Set(prev.map(a => a.id));
        return [...prev, ...res.data.filter(a => !existing.has(a.id))];
      });
    }
    setTotal(res.total);
    setPage(res.page);
  }

  useEffect(() => {
    auctionsApi.list({ page: 1, limit: 20 })
      .then((r) => applyResponse(r.data))
      .catch(() => setAuctions([]))
      .finally(() => setLoading(false));

    const dataInterval = setInterval(() => {
      auctionsApi.list({ page: 1, limit: 20 })
        .then((r) => applyResponse(r.data))
        .catch(() => {});
    }, 30_000);

    const tickInterval = setInterval(() => setTick(t => t + 1), 1000);

    return () => { clearInterval(dataInterval); clearInterval(tickInterval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await auctionsApi.list({ page: page + 1, limit: 20 });
      applyResponse(r.data);
    } catch {}
    finally { setLoadingMore(false); }
  }

  const filtered = auctions.filter((a) => {
    const matchesFilter = filter === "all" || a.status === filter;
    const q = search.toLowerCase();
    const matchesSearch =
      q === "" ||
      (a.title ?? a.name ?? "").toLowerCase().includes(q) ||
      (a.seller?.username ?? a.sellerName ?? "").toLowerCase().includes(q);
    return matchesFilter && matchesSearch;
  });

  const liveCount = auctions.filter((a) => a.status === "live").length;
  const hasMore = auctions.length < total;

  return (
    <div className="min-h-screen bg-[#0F0F14] text-white">
      <Navbar />

      <div className="pt-24 pb-8 border-b border-white/5">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              {!loading && (
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-sm text-red-400 font-semibold">
                    {liveCount} subastas en vivo ahora
                  </span>
                </div>
              )}
              <h1 className="text-4xl font-black tracking-tight">Subastas</h1>
              <p className="text-zinc-500 mt-1">
                {loading ? "Cargando..." : `${auctions.length} subastas activas y próximas`}
              </p>
            </div>

            <div className="relative w-full md:w-80">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
              <input
                type="text"
                placeholder="Buscar carta, vendedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-[#16161E] border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-1">
            {FILTERS.map((f) => {
              const count =
                f.key === "all"
                  ? auctions.length
                  : auctions.filter((a) => a.status === f.key).length;
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  aria-pressed={active}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
                  style={
                    active
                      ? { background: "rgba(108,58,232,0.2)", border: "1px solid rgba(108,58,232,0.4)", color: "#a78bfa" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a" }
                  }
                >
                  {f.dot && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: f.dot, boxShadow: active ? `0 0 6px ${f.dot}` : "none" }}
                    />
                  )}
                  {f.label}
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-md"
                    style={{ background: active ? "rgba(108,58,232,0.3)" : "rgba(255,255,255,0.06)" }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 py-10">
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden animate-pulse"
                style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div className="h-44 bg-[#1e1e2a]" />
                <div className="p-4 space-y-3">
                  <div className="h-4 bg-[#1e1e2a] rounded w-3/4" />
                  <div className="h-3 bg-[#1e1e2a] rounded w-1/2" />
                  <div className="h-10 bg-[#1e1e2a] rounded mt-4" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <AuctionsEmptyState search={search} filter={filter} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((a, idx) => {
              const status = STATUS_LABEL[a.status ?? "upcoming"];
              const gradient = GRADIENTS[idx % GRADIENTS.length];
              const glow = GLOWS[idx % GLOWS.length];
              const sellerName = a.seller?.username ?? a.sellerName ?? "—";
              const verified = a.seller?.verified;
              const currentBid = a.currentBid ?? a.startingBid ?? 0;
              const title = a.title ?? a.name ?? "Sin título";

              return (
                <Link key={a.id} href={`/auctions/${a.id}`}>
                  <div
                    className="rounded-2xl overflow-hidden hover:scale-[1.02] hover:border-[#6C3AE8]/30 transition-all cursor-pointer"
                    style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
                  >
                    <div className="relative h-44 bg-[#0d0d1a] flex items-center justify-center overflow-hidden">
                      <div
                        className="absolute inset-0 opacity-30"
                        style={{ background: `radial-gradient(circle at center, ${glow} 0%, transparent 70%)` }}
                      />
                      <div
                        className={`relative w-20 h-28 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-3xl shadow-2xl`}
                        style={{ boxShadow: `0 0 30px ${glow}` }}
                      >
                        🃏
                      </div>

                      <div
                        className="absolute top-3 left-3 flex items-center gap-1.5 text-white text-[10px] font-black px-2.5 py-1 rounded-full"
                        style={{ background: status?.bg, boxShadow: `0 2px 10px ${status?.glow}` }}
                      >
                        {a.status === "live" && (
                          <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
                        )}
                        {status?.text ?? a.status}
                      </div>

                      {a.status !== "upcoming" && (
                        <div className="absolute bottom-3 left-3 text-xs text-zinc-400 bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full">
                          👁 {a.viewers ?? 0}
                        </div>
                      )}
                      <div className="absolute bottom-3 right-3 text-xs font-mono font-bold text-white bg-black/60 backdrop-blur-sm px-2 py-0.5 rounded-full">
                        {formatTimer(a.endTime)}
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-bold text-white text-sm leading-tight">{title}</p>
                        {a.condition && (
                          <span
                            className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md"
                            style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.2)" }}
                          >
                            {a.condition}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mb-4">{a.game ?? ""}</p>

                      <div className="flex items-end justify-between mb-4">
                        <div>
                          <p className="text-[10px] text-zinc-600 mb-0.5">
                            {a.status === "upcoming" ? "Precio inicial" : "Puja actual"}
                          </p>
                          <p className="text-xl font-black text-white">
                            ${currentBid.toLocaleString("es-MX")}{" "}
                            <span className="text-xs text-zinc-500 font-normal">MXN</span>
                          </p>
                          {a.binPrice && (
                            <p className="text-[10px] text-zinc-500 mt-0.5">
                              Comprar ya: ${a.binPrice.toLocaleString("es-MX")} MXN
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-zinc-600 mb-0.5">Vendedor</p>
                          <p className="text-xs font-semibold text-white">
                            {sellerName} {verified && <span className="text-[#a78bfa]">✓</span>}
                          </p>
                        </div>
                      </div>

                      <div
                        className="w-full py-2.5 rounded-xl text-sm font-bold text-white text-center"
                        style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                      >
                        {a.status === "live" ? "Entrar y pujar →" : a.status === "ending" ? "Ver subasta →" : "Recordarme →"}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Cargar más — only shown when not filtering/searching locally and there are more pages */}
        {!loading && hasMore && !search && filter === "all" && (
          <div className="flex justify-center mt-10">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-8 py-3 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-60"
              style={{ background: "rgba(108,58,232,0.2)", border: "1px solid rgba(108,58,232,0.4)" }}
            >
              {loadingMore ? "Cargando..." : `Cargar más (${total - auctions.length} restantes)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const AUCTIONS_EMPTY = [
  { icon: "🎴", title: "Sin subastas en este momento", sub: "El estadio está en calma. Los duelos comienzan pronto." },
  { icon: "⏳", title: "Nada por aquí aún", sub: "Como buscar una carta holográfica — hay que tener paciencia." },
  { icon: "🌙", title: "El mercado descansa", sub: "Vuelve pronto para ver las próximas subastas en vivo." },
  { icon: "🔍", title: "Sin resultados", sub: "Intenta buscar con otras palabras o quita los filtros." },
];

function AuctionsEmptyState({ search, filter }: { search: string; filter: string }) {
  const randomIdx = useMemo(() => Math.floor(Math.random() * 3), [search]);
  const msg = search ? AUCTIONS_EMPTY[3] : AUCTIONS_EMPTY[randomIdx];
  return (
    <div className="text-center py-24">
      <p className="text-5xl mb-4">{msg.icon}</p>
      <p className="text-lg font-bold text-zinc-300">{msg.title}</p>
      <p className="text-sm text-zinc-600 mt-1">{msg.sub}</p>
      {filter !== "all" && (
        <p className="text-xs text-zinc-700 mt-3">Prueba cambiando el filtro a "Todas"</p>
      )}
    </div>
  );
}
