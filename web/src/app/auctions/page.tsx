"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { auctionsApi, type ApiAuction } from "@/lib/api";
import { formatTimer, gameLabel } from "@/lib/format";

type Filter = "all" | "live" | "ending" | "upcoming";

const FILTERS: { key: Filter; label: string; dot?: string; icon: string }[] = [
  { key: "all",      label: "Todas",        icon: "🎴" },
  { key: "live",     label: "En vivo",      dot: "#ef4444", icon: "📡" },
  { key: "ending",   label: "Por terminar", dot: "#f59e0b", icon: "⏱" },
  { key: "upcoming", label: "Próximas",     dot: "#2563EB", icon: "📅" },
];

const STATUS_LABEL: Record<string, { text: string; bg: string; glow: string }> = {
  live:     { text: "EN VIVO",        bg: "#ef4444", glow: "rgba(239,68,68,0.4)" },
  ending:   { text: "TERMINA PRONTO", bg: "#f59e0b", glow: "rgba(245,158,11,0.3)" },
  upcoming: { text: "PRÓXIMO",        bg: "#2563EB", glow: "rgba(37,99,235,0.3)" },
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
  "rgba(59,130,246,0.4)",
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
  const [error, setError]       = useState(false);
  const [filter, setFilter]     = useState<Filter>("all");
  const [search, setSearch]     = useState("");
  const [, setTick] = useState(0);

  const searchRef = useRef(search);
  useEffect(() => { searchRef.current = search; }, [search]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const isFirstSearchRun = useRef(true);

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

  function loadInitial(q: string) {
    setLoading(true);
    const myId = ++requestIdRef.current;
    auctionsApi.list({ page: 1, limit: 20, q: q || undefined })
      .then((r) => {
        if (myId !== requestIdRef.current) return;
        applyResponse(r.data);
        setError(false);
      })
      .catch(() => {
        if (myId !== requestIdRef.current) return;
        setError(true);
      })
      .finally(() => {
        if (myId === requestIdRef.current) setLoading(false);
      });
  }

  useEffect(() => {
    // Inlined (rather than calling loadInitial) so the initial fetch's
    // setState calls happen inside the async .then/.catch/.finally chain
    // instead of synchronously in the effect body.
    const myId = ++requestIdRef.current;
    auctionsApi.list({ page: 1, limit: 20 })
      .then((r) => {
        if (myId !== requestIdRef.current) return;
        applyResponse(r.data);
        setError(false);
      })
      .catch(() => {
        if (myId !== requestIdRef.current) return;
        setError(true);
      })
      .finally(() => {
        if (myId === requestIdRef.current) setLoading(false);
      });

    const dataInterval = setInterval(() => {
      auctionsApi.list({ page: 1, limit: 20, q: searchRef.current || undefined })
        .then((r) => applyResponse(r.data))
        .catch(() => {});
    }, 30_000);

    const tickInterval = setInterval(() => setTick(t => t + 1), 1000);

    return () => { clearInterval(dataInterval); clearInterval(tickInterval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced server-side search: skip the very first run (handled by the mount effect above)
  useEffect(() => {
    if (isFirstSearchRun.current) { isFirstSearchRun.current = false; return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadInitial(search), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await auctionsApi.list({ page: page + 1, limit: 20, q: search || undefined });
      applyResponse(r.data);
    } catch {}
    finally { setLoadingMore(false); }
  }

  const filtered = auctions.filter((a) => filter === "all" || a.status === filter);

  const liveCount = auctions.filter((a) => a.status === "live").length;
  const hasMore = auctions.length < total;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />
      <main id="main">

      {/* ── Header ── */}
      <div className="pt-24 pb-8" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="mx-auto max-w-[1600px] px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">

            <div>
              {!loading && liveCount > 0 && (
                <div
                  className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 rounded-full"
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.28)" }}
                >
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xs font-bold" style={{ color: "#ef4444" }}>
                    {liveCount} {liveCount === 1 ? "subasta" : "subastas"} en vivo ahora
                  </span>
                </div>
              )}
              <h1 className="text-4xl font-black tracking-tight gradient-text">Subastas</h1>
              <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                {loading ? "Cargando..." : total === 1 ? "1 subasta activa o próxima" : `${total} subastas activas y próximas`}
              </p>
            </div>

            {/* Search bar */}
            <div className="relative w-full md:w-80">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: "var(--text-muted)" }}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                aria-label="Buscar subastas por carta o vendedor"
                placeholder="Buscar carta, vendedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl pl-10 pr-4 py-3 text-sm transition-all placeholder:text-zinc-600"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = "rgba(37,99,235,0.55)";
                  e.currentTarget.style.boxShadow   = "0 0 0 3px rgba(37,99,235,0.12)";
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow   = "none";
                }}
              />
            </div>
          </div>

          {/* Filter pills */}
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
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all"
                  style={
                    active
                      ? {
                          background: "rgba(37,99,235,0.18)",
                          border: "1px solid rgba(37,99,235,0.5)",
                          color: "var(--accent-text)",
                          boxShadow: "0 0 14px rgba(37,99,235,0.22), inset 0 1px 0 rgba(255,255,255,0.06)",
                        }
                      : {
                          background: "var(--bg-hover)",
                          border: "1px solid var(--border)",
                          color: "var(--text-muted)",
                        }
                  }
                >
                  <span className="text-sm leading-none">{f.icon}</span>
                  {f.dot && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{
                        background: f.dot,
                        boxShadow: active ? `0 0 6px ${f.dot}` : "none",
                      }}
                    />
                  )}
                  {f.label}
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-md font-bold"
                    style={{
                      background: active ? "rgba(37,99,235,0.3)" : "var(--bg-elevated)",
                      color: active ? "var(--accent-text)" : "var(--text-muted)",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Grid ── */}
      <div className="mx-auto max-w-[1600px] px-6 py-10">
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden animate-pulse"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
              >
                <div className="h-72" style={{ background: "var(--bg-elevated)" }} />
                <div className="p-4 space-y-3">
                  <div className="h-4 rounded-lg w-3/4" style={{ background: "var(--bg-elevated)" }} />
                  <div className="h-3 rounded-lg w-1/2" style={{ background: "var(--bg-elevated)" }} />
                  <div className="h-10 rounded-xl mt-4" style={{ background: "var(--bg-elevated)" }} />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div role="alert" className="text-center py-28">
            <div
              className="inline-flex items-center justify-center w-24 h-24 rounded-3xl text-5xl mb-6"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid rgba(239,68,68,0.3)",
                boxShadow: "0 0 40px rgba(239,68,68,0.1)",
              }}
            >
              ⚠️
            </div>
            <p className="text-xl font-black mb-2" style={{ color: "var(--text-primary)" }}>
              No se pudieron cargar las subastas
            </p>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
              Ocurrió un problema de conexión. Intenta de nuevo.
            </p>
            <button
              onClick={() => loadInitial(search)}
              className="px-6 py-2.5 rounded-full font-bold text-sm transition-all"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-brand)",
                color: "var(--accent-text)",
              }}
            >
              Reintentar
            </button>
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
              const cardAriaLabel = `${title} — ${sellerName}, ${
                a.status === "upcoming" ? "precio inicial" : "puja actual"
              } $${(currentBid / 100).toLocaleString("es-MX")} MXN, ${
                a.status === "upcoming" ? "inicia en" : "termina en"
              } ${formatTimer(a.endTime)}`;

              return (
                <Link key={a.id} href={`/auctions/${a.id}`} aria-label={cardAriaLabel}>
                  <div
                    className="rounded-2xl overflow-hidden cursor-pointer transition-all duration-300"
                    style={{
                      background: "var(--bg-surface)",
                      border: "1px solid var(--border)",
                      boxShadow: "var(--card-shadow)",
                    }}
                    onMouseEnter={e => {
                      const el = e.currentTarget;
                      el.style.transform   = "translateY(-3px)";
                      el.style.borderColor = "rgba(37,99,235,0.4)";
                      el.style.boxShadow   = "0 16px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(37,99,235,0.15)";
                    }}
                    onMouseLeave={e => {
                      const el = e.currentTarget;
                      el.style.transform   = "translateY(0)";
                      el.style.borderColor = "var(--border)";
                      el.style.boxShadow   = "var(--card-shadow)";
                    }}
                  >
                    {/* ── Image area ── */}
                    <div
                      className="relative h-72 flex items-center justify-center overflow-hidden"
                      style={{ background: "#050508" }}
                    >
                      {/* Blurred backdrop echo of the card art */}
                      {a.items?.[0]?.imageUrls?.[0] && (
                        <div
                          className="absolute inset-0 scale-110"
                          style={{
                            backgroundImage: `url(${a.items[0].imageUrls[0]})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            filter: "blur(30px) saturate(1.3) brightness(0.5)",
                            opacity: 0.55,
                          }}
                        />
                      )}

                      {/* Radial glow */}
                      <div
                        className="absolute inset-0"
                        style={{
                          background: `radial-gradient(circle at center, ${glow} 0%, transparent 68%)`,
                          opacity: 0.4,
                        }}
                      />

                      {a.items?.[0]?.imageUrls?.[0] ? (
                        <img
                          src={a.items[0].imageUrls[0]}
                          alt={title}
                          className="relative w-full h-full object-contain max-h-[260px] py-4 drop-shadow-2xl"
                          style={{ filter: "drop-shadow(0 12px 30px rgba(0,0,0,0.55))" }}
                        />
                      ) : (
                        <div
                          className={`relative w-32 h-44 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-5xl shadow-2xl`}
                          style={{ boxShadow: `0 0 40px ${glow}` }}
                        >
                          🃏
                        </div>
                      )}

                      {/* Status badge */}
                      <div
                        className="absolute top-3 left-3 flex items-center gap-1.5 text-white text-[11px] font-black px-2.5 py-1 rounded-full"
                        style={{
                          background: status?.bg,
                          boxShadow: `0 2px 12px ${status?.glow}`,
                        }}
                      >
                        {a.status === "live" && (
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                        )}
                        {status?.text ?? a.status}
                      </div>

                      {/* Viewers */}
                      {a.status !== "upcoming" && (
                        <div
                          className="absolute bottom-3 left-3 text-xs backdrop-blur-sm px-2.5 py-1 rounded-full"
                          style={{ background: "rgba(0,0,0,0.65)", color: "rgba(255,255,255,0.75)" }}
                        >
                          👁 {a.viewers ?? 0}
                        </div>
                      )}

                      {/* Timer chip — red glow when live */}
                      <div
                        className="absolute bottom-3 right-3 text-xs font-mono font-black px-2.5 py-1 rounded-full backdrop-blur-sm"
                        style={{
                          background: a.status === "live" ? "rgba(239,68,68,0.88)" : "rgba(0,0,0,0.7)",
                          color: "#fff",
                          boxShadow: a.status === "live" ? "0 0 14px rgba(239,68,68,0.5)" : "none",
                        }}
                      >
                        {formatTimer(a.endTime)}
                      </div>

                      {/* Bottom fade overlay */}
                      <div
                        className="absolute inset-x-0 bottom-0 h-16 pointer-events-none"
                        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65), transparent)" }}
                      />
                    </div>

                    {/* ── Card body ── */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-0.5">
                        <p className="font-bold text-sm leading-tight" style={{ color: "var(--text-primary)" }}>
                          {title}
                        </p>
                        {a.condition && (
                          <span
                            className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-md"
                            style={{
                              background: "rgba(37,99,235,0.15)",
                              color: "var(--accent-text)",
                              border: "1px solid rgba(37,99,235,0.2)",
                            }}
                          >
                            {a.condition}
                          </span>
                        )}
                      </div>
                      <p className="text-xs mb-4 truncate" style={{ color: "var(--text-muted)" }}>
                        {gameLabel(a.game)}
                        {a.items?.[0]?.cardSet && (
                          <span style={{ color: "var(--accent-text)" }}> · {a.items[0].cardSet}</span>
                        )}
                      </p>

                      <div className="flex items-end justify-between mb-4">
                        <div>
                          <p className="text-[11px] mb-0.5" style={{ color: "var(--text-muted)" }}>
                            {a.status === "upcoming" ? "Precio inicial" : "Puja actual"}
                          </p>
                          <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>
                            ${(currentBid / 100).toLocaleString("es-MX")}{" "}
                            <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>MXN</span>
                          </p>
                          {a.binPrice && (
                            <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                              Comprar ya: ${(a.binPrice / 100).toLocaleString("es-MX")} MXN
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] mb-0.5" style={{ color: "var(--text-muted)" }}>Vendedor</p>
                          <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                            {sellerName}{" "}
                            {verified && <span style={{ color: "var(--accent-text)" }}>✓</span>}
                          </p>
                        </div>
                      </div>

                      <div
                        className="w-full py-2.5 rounded-xl text-sm font-black text-white text-center transition-all active:scale-95"
                        style={{
                          background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                          boxShadow: "0 4px 14px rgba(37,99,235,0.3)",
                        }}
                      >
                        {a.status === "live"
                          ? "Entrar y pujar →"
                          : a.status === "ending"
                          ? "Ver subasta →"
                          : "Recordarme →"}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* ── Load more ── */}
        {!loading && !error && hasMore && (
          <div className="flex justify-center mt-12">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="px-8 py-3.5 rounded-full font-bold text-sm transition-all disabled:opacity-50"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-brand)",
                color: "var(--accent-text)",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background  = "rgba(37,99,235,0.12)";
                e.currentTarget.style.boxShadow   = "0 0 20px rgba(37,99,235,0.18)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background  = "var(--bg-elevated)";
                e.currentTarget.style.boxShadow   = "none";
              }}
            >
              {loadingMore ? (
                <span className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  Cargando...
                </span>
              ) : (
                `Cargar más — ${total - auctions.length} restantes`
              )}
            </button>
          </div>
        )}
      </div>
      </main>
    </div>
  );
}

const AUCTIONS_EMPTY = [
  { icon: "🎴", title: "Sin subastas en este momento",  sub: "El estadio está en calma. Los duelos comienzan pronto." },
  { icon: "⏳", title: "Nada por aquí aún",              sub: "Como buscar una carta holográfica — hay que tener paciencia." },
  { icon: "🌙", title: "El mercado descansa",            sub: "Vuelve pronto para ver las próximas subastas en vivo." },
  { icon: "🔍", title: "Sin resultados",                 sub: "Intenta buscar con otras palabras o quita los filtros." },
];

function AuctionsEmptyState({ search, filter }: { search: string; filter: string }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pick once per mount, not per keystroke
  const randomIdx = useMemo(() => Math.floor(Math.random() * 3), []);
  const msg = search ? AUCTIONS_EMPTY[3] : AUCTIONS_EMPTY[randomIdx];
  return (
    <div className="text-center py-28">
      <div
        className="inline-flex items-center justify-center w-24 h-24 rounded-3xl text-5xl mb-6"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-brand)",
          boxShadow: "0 0 40px rgba(37,99,235,0.1)",
        }}
      >
        {msg.icon}
      </div>
      <p className="text-xl font-black mb-2" style={{ color: "var(--text-primary)" }}>
        {msg.title}
      </p>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {msg.sub}
      </p>
      {filter !== "all" && (
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
          Prueba cambiando el filtro a &ldquo;Todas&rdquo;
        </p>
      )}
    </div>
  );
}
