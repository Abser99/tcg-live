"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import AmbientBackground from "@/components/AmbientBackground";
import { auctionsApi, type ApiAuction } from "@/lib/api";
import { formatTimer, gameLabel, liveName } from "@/lib/format";
import { setAuctionsCache } from "@/lib/live-back-cache";
import { useFavoriteSellers } from "@/lib/seller-favorites";
import { useAuth } from "@/contexts/auth";

const INK = "var(--brand-ink)";

/* Heart to the right of the seller name. Following a seller (a) surfaces them in the
   "Favoritos" filter and (b) opts you into a browser alert when their live starts. */
type Filter = "all" | "live" | "ending" | "upcoming" | "favorites";

const FILTERS: { key: Filter; label: string; dot?: string }[] = [
  { key: "all",       label: "Todas" },
  { key: "live",      label: "En vivo",   dot: "#ef4444" },
  { key: "upcoming",  label: "Próximas",  dot: "var(--text-muted)" },
  { key: "favorites", label: "Favoritos", dot: "#f43f5e" },
];

// Category filters for "Todas las subastas" (multi-select). Values match the seller's stream categories.
const CATEGORIES: { value: string; label: string }[] = [
  { value: "pokemon",    label: "Pokémon" },
  { value: "onepiece",   label: "One Piece" },
  { value: "yugioh",     label: "Yu-Gi-Oh!" },
  { value: "mtg",        label: "Magic" },
  { value: "lorcana",    label: "Lorcana" },
  { value: "dragonball", label: "Dragon Ball" },
  { value: "sports",     label: "Deportes" },
  { value: "other",      label: "Otro" },
];

/* status chip: dot color + label (minimal, no colored fills) */
const STATUS: Record<string, { text: string; dot: string }> = {
  live:     { text: "En vivo",  dot: "#ef4444" },
  upcoming: { text: "Próximo",  dot: "var(--text-muted)" },
};

/* Map the backend status (`scheduled` / `live` / …) to a display bucket. */
function dispStatus(a: ApiAuction): Filter {
  if (a.status === "live") return "live";
  if (a.status === "scheduled" || a.status === "upcoming") return "upcoming";
  return "upcoming";
}

function CardPlaceholder() {
  return (
    <div className="w-24 h-32 rounded-lg flex items-center justify-center"
      style={{ background: "linear-gradient(155deg, var(--bg-input), var(--bg-elevated))", border: "1px solid var(--border)" }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--text-muted)" strokeWidth={1.2}>
        <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export default function AuctionsPage() {
  const [auctions, setAuctions] = useState<ApiAuction[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(false);
  const [filter, setFilter]     = useState<Filter>("all");
  const [catFilter, setCatFilter] = useState<string[]>([]); // selected categories (multi)
  const favSellers = useFavoriteSellers();
  const [search, setSearch]     = useState("");
  const { user } = useAuth();
  const router = useRouter();
  const role = String(user?.role ?? "").toLowerCase();
  const isSeller = role === "seller" || role === "admin";
  const [goingLive, setGoingLive] = useState(false);
  // Split "Iniciar stream" button: the chevron opens a small menu with "Agendar stream".
  const [startMenuOpen, setStartMenuOpen] = useState(false);
  const startMenuRef = useRef<HTMLDivElement>(null);
  // Scheduler modal state
  const [showScheduler, setShowScheduler] = useState(false);
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("");
  const [schedCats, setSchedCats] = useState<string[]>(["pokemon"]);
  const [scheduling, setScheduling] = useState(false);
  const [schedError, setSchedError] = useState("");

  useEffect(() => {
    if (!startMenuOpen) return;
    const onDoc = (e: MouseEvent) => { if (startMenuRef.current && !startMenuRef.current.contains(e.target as Node)) setStartMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [startMenuOpen]);

  // Seller: create a live auction and jump straight into it (number is auto-assigned)
  async function startLive() {
    if (goingLive) return;
    setGoingLive(true);
    try {
      const { data } = await auctionsApi.create({ isStream: true } as any);
      await auctionsApi.start((data as any).id);
      router.push(`/auctions/${(data as any).id}?stream=1`);
    } catch (err: any) {
      setGoingLive(false);
      alert(err?.response?.data?.message ?? "No se pudo iniciar el stream.");
    }
  }

  function openScheduler() {
    // Default to tomorrow at 19:00 (a sensible prime-time slot)
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    setSchedDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    setSchedTime("19:00");
    setSchedCats(["pokemon"]);
    setSchedError("");
    setShowScheduler(true);
  }

  async function scheduleStream() {
    if (scheduling) return;
    setSchedError("");
    if (!schedDate || !schedTime) { setSchedError("Elige fecha y hora."); return; }
    const when = new Date(`${schedDate}T${schedTime}`);
    if (isNaN(when.getTime())) { setSchedError("Fecha u hora inválida."); return; }
    if (when.getTime() <= Date.now()) { setSchedError("La fecha debe ser en el futuro."); return; }
    if (schedCats.length === 0) { setSchedError("Elige al menos una categoría."); return; }
    setScheduling(true);
    try {
      await auctionsApi.create({ isStream: true, scheduledAt: when.toISOString(), categories: schedCats } as any);
      setShowScheduler(false);
      setFilter("upcoming");           // show the new scheduled stream under "Próximas"
      loadInitial(search);             // refresh the list so it appears
    } catch (err: any) {
      setSchedError(err?.response?.data?.message ?? "No se pudo agendar el stream.");
    } finally {
      setScheduling(false);
    }
  }
  const [, setTick] = useState(0);

  const searchRef = useRef(search);
  useEffect(() => { searchRef.current = search; }, [search]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const isFirstSearchRun = useRef(true);

  function applyResponse(res: { data: ApiAuction[]; total: number; page: number }) {
    if (res.page === 1) {
      setAuctions(res.data);
      setAuctionsCache(res.data);
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

  const isFav = (a: ApiAuction) => {
    const n = a.seller?.username ?? a.sellerName;
    return !!n && favSellers.includes(n);
  };
  const auctionCats = (a: ApiAuction) => (a.categories && a.categories.length ? a.categories : (a.game ? [a.game] : []));
  const filtered = auctions.filter((a) => {
    const statusOk = filter === "all" ? true : filter === "favorites" ? isFav(a) : dispStatus(a) === filter;
    const catOk = catFilter.length === 0 || auctionCats(a).some((c) => catFilter.includes(c));
    return statusOk && catOk;
  });
  const liveCount = auctions.filter((a) => a.status === "live").length;
  const hasMore = auctions.length < total;

  // The seller's OWN live (if any). One-live-at-a-time: while this exists the top CTA must
  // lead back into it, not offer to start another (which the backend would reject anyway).
  const myLive = isSeller
    ? auctions.find((a) => a.status === "live" && (
        (user?.id && a.sellerId === user.id) ||
        (user?.username && a.seller?.username === user.username)
      ))
    : undefined;

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <style>{`
        .a-card { transition: transform 0.25s cubic-bezier(0.22,1,0.36,1), border-color 0.25s ease; }
        .a-card:hover { transform: translateY(-4px); border-color: var(--border-brand); }
        .a-btn { transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease; }
        .a-btn:hover { border-color: var(--border-brand); color: var(--accent-text); }
        .btn-brand { transition: transform 0.15s ease, box-shadow 0.25s ease, filter 0.2s ease; }
        .btn-brand:hover { box-shadow: 0 8px 26px color-mix(in srgb, var(--brand) 35%, transparent); filter: brightness(1.05); }
        .btn-brand:active { transform: scale(0.96); }
        .pill { transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease; }
        .u-link { position: relative; }
        .u-link::after { content: ""; position: absolute; left: 0; bottom: -2px; width: 100%; height: 1px; background: currentColor; transform: scaleX(0); transform-origin: left; transition: transform 0.3s cubic-bezier(0.22,1,0.36,1); }
        .u-link:hover::after { transform: scaleX(1); }
      `}</style>
      <Navbar />
      <AmbientBackground top={360} />
      {/* Above the ambient layer, which sits at z-0 */}
      <main id="main" className="relative z-[1]">

        {/* ── Header ── */}
        <div className="pt-32 pb-6" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="mx-auto max-w-6xl px-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                {!loading && liveCount > 0 && (
                  <div className="inline-flex items-center gap-2 mb-4 text-[11px] font-medium uppercase" style={{ letterSpacing: "0.16em", color: "var(--text-muted)" }}>
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#ef4444" }} />
                    {liveCount} {liveCount === 1 ? "subasta en vivo ahora" : "subastas en vivo ahora"}
                  </div>
                )}
                <h1 className="text-4xl md:text-[2.75rem] font-medium tracking-[-0.025em]" style={{ color: "var(--text-primary)" }}>Subastas</h1>
                <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                  {loading ? "Cargando…" : total === 1 ? "1 subasta activa o próxima" : `${total} subastas activas y próximas`}
                </p>
              </div>

              {/* Search + seller CTA */}
              <div className="flex items-center gap-2 w-full md:w-auto">
              {isSeller && (
                // Split button: main action (start now, or continue an active live) + chevron → Agendar stream.
                <div className="relative shrink-0 md:order-2" ref={startMenuRef}>
                  <div className="flex items-stretch">
                    {myLive ? (
                      <Link
                        href={`/auctions/${myLive.id}?stream=1`}
                        className="btn-brand flex items-center gap-1.5 pl-4 pr-3 py-3 rounded-l-full text-[13px] font-black"
                        style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)", color: "#fff", boxShadow: "0 4px 16px rgba(220,38,38,0.35)" }}
                      >
                        <span className="w-2 h-2 rounded-full bg-white/90 animate-pulse" />
                        Continuar mi live
                      </Link>
                    ) : (
                      <button
                        onClick={startLive}
                        disabled={goingLive}
                        className="btn-brand flex items-center gap-1.5 pl-4 pr-3 py-3 rounded-l-full text-[13px] font-black disabled:opacity-60"
                        style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)", color: "#fff", boxShadow: "0 4px 16px rgba(220,38,38,0.35)" }}
                      >
                        <span className="w-2 h-2 rounded-full bg-white/90 animate-pulse" />
                        {goingLive ? "Iniciando…" : "Iniciar stream"}
                      </button>
                    )}
                    <button
                      onClick={() => setStartMenuOpen((o) => !o)}
                      aria-label="Más opciones de stream" aria-expanded={startMenuOpen}
                      className="flex items-center px-2.5 rounded-r-full"
                      style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)", color: "#fff", boxShadow: "0 4px 16px rgba(220,38,38,0.35)", borderLeft: "1px solid rgba(255,255,255,0.28)" }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        className="transition-transform" style={{ transform: startMenuOpen ? "rotate(180deg)" : "none" }} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                  </div>
                  {startMenuOpen && (
                    <div role="menu" className="absolute right-0 mt-2 w-52 rounded-2xl overflow-hidden py-1.5 z-50"
                      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
                      <button role="menuitem" onClick={() => { setStartMenuOpen(false); openScheduler(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-left transition-colors hover:bg-[var(--bg-hover)]"
                        style={{ color: "var(--text-secondary)" }}>
                        <span className="text-base leading-none" aria-hidden="true">📅</span>
                        Agendar stream
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="relative flex-1 md:w-80 md:flex-none md:order-1">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--text-muted)" }}
                  fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  aria-label="Buscar por vendedor"
                  placeholder="Buscar vendedor…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-full pl-10 pr-4 py-3 text-sm transition-all"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  onFocus={e => { e.currentTarget.style.borderColor = "var(--border-brand)"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--brand) 12%, transparent)"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>
              </div>
            </div>

            {/* Filter pills — always one row (scrolls horizontally if it overflows) */}
            <div className="flex items-center gap-1.5 overflow-x-auto mt-7 pb-1 pr-6" style={{
              scrollbarWidth: "none",
              WebkitMaskImage: "linear-gradient(to right, black calc(100% - 28px), transparent 100%)",
              maskImage: "linear-gradient(to right, black calc(100% - 28px), transparent 100%)",
            }}>
              {FILTERS.map((f) => {
                const count = f.key === "all" ? auctions.length : f.key === "favorites" ? auctions.filter(isFav).length : auctions.filter((a) => dispStatus(a) === f.key).length;
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    aria-pressed={active}
                    className="pill flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0"
                    style={active
                      ? { background: "color-mix(in srgb, var(--brand) 8%, transparent)", border: "1px solid var(--border-brand)", color: "var(--accent-text)" }
                      : { background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                  >
                    {f.dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: f.dot }} />}
                    {f.label}
                    <span className="text-[11px] tabular-nums px-1.5 rounded-md"
                      style={{ background: active ? "color-mix(in srgb, var(--brand) 12%, transparent)" : "var(--bg-elevated)", color: active ? "var(--accent-text)" : "var(--text-muted)" }}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Category filter — multi-select; only shows categories that have auctions */}
            {(() => {
              const cats = CATEGORIES.filter((c) => catFilter.includes(c.value) || auctions.some((a) => auctionCats(a).includes(c.value)));
              if (cats.length === 0) return null;
              return (
                <div className="flex items-center gap-1.5 overflow-x-auto mt-3 pb-1 pr-6" style={{
                  scrollbarWidth: "none",
                  WebkitMaskImage: "linear-gradient(to right, black calc(100% - 28px), transparent 100%)",
                  maskImage: "linear-gradient(to right, black calc(100% - 28px), transparent 100%)",
                }}>
                  <span className="text-[11px] uppercase tracking-wide shrink-0 mr-0.5" style={{ color: "var(--text-muted)" }}>Categoría</span>
                  {catFilter.length > 0 && (
                    <button onClick={() => setCatFilter([])}
                      className="pill flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0"
                      style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)" }}>✕ Limpiar</button>
                  )}
                  {cats.map((c) => {
                    const count = auctions.filter((a) => auctionCats(a).includes(c.value)).length;
                    const on = catFilter.includes(c.value);
                    return (
                      <button key={c.value} aria-pressed={on}
                        onClick={() => setCatFilter((p) => p.includes(c.value) ? p.filter((x) => x !== c.value) : [...p, c.value])}
                        className="pill flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap shrink-0"
                        style={on
                          ? { background: "color-mix(in srgb, var(--brand) 8%, transparent)", border: "1px solid var(--border-brand)", color: "var(--accent-text)" }
                          : { background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                        {c.label}
                        <span className="text-[11px] tabular-nums px-1.5 rounded-md"
                          style={{ background: on ? "color-mix(in srgb, var(--brand) 12%, transparent)" : "var(--bg-elevated)", color: on ? "var(--accent-text)" : "var(--text-muted)" }}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── Grid ── */}
        <div className="mx-auto max-w-6xl px-6 pt-7 pb-16">
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                  <div className="h-56 shimmer" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 rounded-md w-3/4 shimmer" />
                    <div className="h-3 rounded-md w-1/2 shimmer" />
                    <div className="h-9 rounded-lg mt-4 shimmer" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div role="alert" className="text-center py-28">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--error-text)" }}>
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
              </div>
              <p className="text-lg font-medium mb-2" style={{ color: "var(--text-primary)" }}>No se pudieron cargar las subastas</p>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>Ocurrió un problema de conexión. Intenta de nuevo.</p>
              <button onClick={() => loadInitial(search)} className="px-6 py-2.5 rounded-full font-semibold text-sm" style={{ background: "var(--brand-light)", color: INK }}>
                Reintentar
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <AuctionsEmptyState search={search} filter={filter} />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8">
              {filtered.map((a) => {
                const disp = dispStatus(a);
                const status = STATUS[disp] ?? STATUS.upcoming;
                const sellerName = a.seller?.username ?? a.sellerName ?? "—";
                const currentBid = a.currentBid ?? a.startingBid ?? 0;
                const title = liveName(a);
                const timer = formatTimer(a.endTime);
                const img = a.items?.[0]?.imageUrls?.[0];
                const cardAriaLabel = `${title} — ${sellerName}, ${a.status === "upcoming" ? "precio inicial" : "puja actual"} $${(currentBid / 100).toLocaleString("es-MX")} MXN`;

                return (
                  <div key={a.id}
                    className="a-card rounded-2xl overflow-hidden relative flex flex-col h-full"
                    style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>

                    {/* Vertical "phone video" preview */}
                    <Link href={`/auctions/${a.id}`} aria-label={cardAriaLabel}
                      className="relative block overflow-hidden" style={{ aspectRatio: "4 / 5" }}>
                      {/* blurred backdrop fills the frame like a live video */}
                      {img
                        ? <div className="absolute inset-0" style={{ backgroundImage: `url(${img})`, backgroundSize: "cover", backgroundPosition: "center", filter: "blur(26px) brightness(0.42) saturate(1.2)", transform: "scale(1.2)" }} />
                        : <div className="absolute inset-0" style={{ background: "linear-gradient(165deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)" }} />}
                      {/* legibility gradient */}
                      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,0.62) 100%)" }} />
                      {/* card art — extra bottom room so the title/price overlay stays clear */}
                      <div className="absolute inset-0 flex items-center justify-center px-5 pt-5 pb-14">
                        {img
                          ? <img src={img} alt="" className="relative max-h-full w-auto object-contain" style={{ filter: "drop-shadow(0 14px 30px rgba(0,0,0,0.55))" }} />
                          : <CardPlaceholder />}
                      </div>

                      {/* chips */}
                      <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full"
                        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff" }}>
                        <span className={`w-1.5 h-1.5 rounded-full ${a.status === "live" ? "animate-pulse" : ""}`} style={{ background: status.dot }} />
                        {status?.text ?? a.status}
                      </div>
                      <div className="absolute top-3 right-3 font-mono text-[11px] px-2 py-1 rounded-md tabular-nums"
                        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.14)", color: a.status === "live" ? "var(--brand-light)" : "#fff" }}>
                        {timer}
                      </div>
                      {a.condition && (
                        <span className="absolute bottom-[2.6rem] left-4 text-[10px] font-medium px-2 py-0.5 rounded-md"
                          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(6px)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff" }}>{a.condition}</span>
                      )}

                      {/* Overlaid title only. The running price is two taps of text over the
                          card art; whoever cares about it is going in anyway, where it
                          updates live instead of being a stale number on a grid. */}
                      <div className="absolute inset-x-0 bottom-0 p-3.5 flex items-end justify-between gap-2">
                        <p className="font-medium text-sm leading-tight tracking-tight text-white line-clamp-2 min-w-0">{title}</p>
                        {/* On a phone card there is no room for both: the pill was breaking
                            the title into scraps. The whole card is the link anyway, and the
                            "En vivo" chip already marks it. */}
                        {disp === "live" && (
                          <span className="btn-brand shrink-0 hidden sm:inline-flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-full"
                            style={{ background: "var(--brand-light)", color: INK }}>
                            Entrar <span aria-hidden>→</span>
                          </span>
                        )}
                      </div>
                    </Link>

                  </div>
                );
              })}
            </div>
          )}

          {/* Load more */}
          {!loading && !error && hasMore && (
            <div className="flex justify-center mt-12">
              <button onClick={loadMore} disabled={loadingMore}
                className="a-btn px-8 py-3 rounded-full font-medium text-sm disabled:opacity-50"
                style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}>
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Cargando…
                  </span>
                ) : `Cargar más — ${total - auctions.length} restantes`}
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── Scheduler modal (Agendar stream) ── */}
      {showScheduler && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowScheduler(false)}>
          <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)", maxHeight: "88vh" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <div className="min-w-0">
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>📅 Agendar stream</p>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>Aparecerá en “Próximas” y avisará a tus seguidores 1 h antes.</p>
              </div>
              <button onClick={() => setShowScheduler(false)} aria-label="Cerrar" className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-base leading-none" style={{ color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>✕</button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {schedError && <p className="text-xs" style={{ color: "var(--error-text)" }}>{schedError}</p>}

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Fecha</label>
                  <input type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }} />
                </div>
                <div className="w-32">
                  <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Hora</label>
                  <input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-sm" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }} />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>Categorías</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map((c) => {
                    const on = schedCats.includes(c.value);
                    return (
                      <button key={c.value} type="button" aria-pressed={on}
                        onClick={() => setSchedCats((p) => p.includes(c.value) ? p.filter((x) => x !== c.value) : [...p, c.value])}
                        className="px-3 py-1.5 rounded-full text-[13px] font-medium"
                        style={on
                          ? { background: "color-mix(in srgb, var(--brand) 12%, transparent)", border: "1px solid var(--border-brand)", color: "var(--accent-text)" }
                          : { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button type="button" onClick={scheduleStream} disabled={scheduling}
                className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-60" style={{ background: "var(--brand-light)", color: INK }}>
                {scheduling ? "Agendando…" : "Agendar stream"}
              </button>
              <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
                El día del stream lo inicias desde aquí o tu panel de vendedor.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const AUCTIONS_EMPTY = [
  { title: "Sin subastas en este momento",  sub: "El estadio está en calma. Los duelos comienzan pronto." },
  { title: "Nada por aquí aún",              sub: "Como buscar una carta holográfica — hay que tener paciencia." },
  { title: "El mercado descansa",            sub: "Vuelve pronto para ver las próximas subastas en vivo." },
  { title: "Sin resultados",                 sub: "Busca por el nombre del vendedor, o quita los filtros." },
];

function AuctionsEmptyState({ search, filter }: { search: string; filter: string }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- pick once per mount, not per keystroke
  const randomIdx = useMemo(() => Math.floor(Math.random() * 3), []);
  const msg = filter === "favorites"
    ? { title: "Aún no tienes vendedores favoritos", sub: "Toca el ♥ en el perfil o el live de un vendedor para verlos aquí." }
    : search ? AUCTIONS_EMPTY[3] : AUCTIONS_EMPTY[randomIdx];
  return (
    <div className="text-center py-28">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
      </div>
      <p className="text-lg font-medium mb-2" style={{ color: "var(--text-primary)" }}>{msg.title}</p>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{msg.sub}</p>
      {filter !== "all" && (
        <p className="text-xs mt-3" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
          Prueba cambiando el filtro a &ldquo;Todas&rdquo;
        </p>
      )}
    </div>
  );
}
