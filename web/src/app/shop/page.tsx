"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import Navbar from "@/components/Navbar";
import { listingsApi, paymentsApi, type ApiListing, type ApiOrder } from "@/lib/api";
import { gameLabel } from "@/lib/format";

type ConditionFilter = "all" | "psa" | "nm" | "lp";

const CONDITION_FILTERS: { key: ConditionFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "psa", label: "PSA / CGC" },
  { key: "nm",  label: "Near Mint" },
  { key: "lp",  label: "Played" },
];

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

function matchesCondition(condition: string | undefined, filter: ConditionFilter) {
  if (filter === "all") return true;
  const c = condition ?? "";
  if (filter === "psa") return c.startsWith("PSA") || c.startsWith("CGC");
  if (filter === "nm") return c === "NM";
  if (filter === "lp") return c === "LP" || c === "MP";
  return true;
}

// ── Purchase Modal ──────────────────────────────────────────────
function PurchaseModal({
  listing,
  onClose,
  onSold,
}: {
  listing: ApiListing;
  onClose: () => void;
  onSold: (id: string) => void;
}) {
  const [step, setStep] = useState<"confirm" | "loading" | "redirecting" | "error">("confirm");
  const [error, setError] = useState("");
  const headingId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleConfirm = useCallback(async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("tcg_token") : null;
    if (!token) {
      window.location.href = `/login?next=/shop`;
      return;
    }

    setStep("loading");
    try {
      const { data: order } = await listingsApi.buy(listing.id);
      setStep("redirecting");

      const { data: checkout } = await paymentsApi.checkout(order.id);
      onSold(listing.id);

      // Redirect to Mercado Pago — use initPoint (MP handles sandbox vs prod by credential)
      window.location.href = checkout.initPoint;
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        "Ocurrió un error al procesar tu compra. Intenta de nuevo.";
      setError(msg);
      setStep("error");
    }
  }, [listing.id, onSold]);

  // Lock body scroll while the modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Move focus into the modal on open
  useEffect(() => {
    (closeBtnRef.current ?? dialogRef.current)?.focus();
  }, []);

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  const sellerName = listing.seller?.username ?? "—";
  const verified = listing.seller?.isVerified;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={handleBackdrop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        ref={dialogRef}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <p id={headingId} className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Confirmar compra</p>
          {step === "confirm" && (
            <button
              ref={closeBtnRef}
              onClick={onClose}
              aria-label="Cerrar"
              className="transition-colors text-lg leading-none"
              style={{ color: "var(--text-muted)" }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Listing preview */}
          <div
            className="flex gap-4 p-3 rounded-xl mb-5"
            style={{ background: "var(--bg-hover)", border: "1px solid var(--border-subtle)" }}
          >
            <div
              className="w-14 h-20 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
              style={{ background: "var(--bg-input)" }}
            >
              {listing.imageUrls?.[0] ? (
                <img src={listing.imageUrls[0]} alt={`Carta: ${listing.title}`} className="w-full h-full object-contain" />
              ) : (
                <span className="text-2xl" aria-hidden="true">🃏</span>
              )}
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <p className="font-bold text-sm leading-tight truncate" style={{ color: "var(--text-primary)" }}>{listing.title}</p>
              {listing.condition && (
                <span className="text-[10px] text-[var(--accent-text)] mt-1">{listing.condition}</span>
              )}
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                {sellerName}{verified && <span className="text-[var(--accent-text)] ml-1">✓</span>}
              </p>
              <p className="text-xl font-black mt-2" style={{ color: "var(--text-primary)" }}>
                ${(listing.price / 100).toLocaleString("es-MX")}{" "}
                <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>MXN</span>
              </p>
            </div>
          </div>

          {step === "confirm" && (
            <>
              <p className="text-xs mb-5 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Al confirmar serás redirigido a Mercado Pago para completar el pago de forma segura.
                Una vez pagado, el vendedor coordinará el envío contigo.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-[var(--bg-hover)]"
                  style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                  style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
                >
                  Ir a pagar →
                </button>
              </div>
            </>
          )}

          {(step === "loading" || step === "redirecting") && (
            <div className="text-center py-4">
              <div
                className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
                style={{ borderColor: "var(--brand)", borderTopColor: "transparent" }}
              />
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {step === "loading" ? "Procesando..." : "Redirigiendo a Mercado Pago..."}
              </p>
            </div>
          )}

          {step === "error" && (
            <>
              <div
                role="alert"
                className="p-3 rounded-xl mb-4 text-sm text-[var(--error-text)]"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                {error}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold hover:bg-[var(--bg-hover)] transition-all"
                  style={{ border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  Cerrar
                </button>
                <button
                  onClick={() => { setStep("confirm"); setError(""); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
                >
                  Reintentar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Listing Card ────────────────────────────────────────────────
function ListingCard({
  listing: l,
  idx,
  onBuy,
}: {
  listing: ApiListing;
  idx: number;
  onBuy: (l: ApiListing) => void;
}) {
  const gradient = GRADIENTS[idx % GRADIENTS.length];
  const glow = GLOWS[idx % GLOWS.length];
  const sellerName = l.seller?.username ?? "—";
  const verified = l.seller?.isVerified;

  return (
    <div
      className="rounded-2xl overflow-hidden hover:scale-[1.02] transition-all"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
    >
      <div className="relative h-44 flex items-center justify-center overflow-hidden" style={{ background: "var(--bg-input)" }}>
        {l.imageUrls?.[0] ? (
          <img src={l.imageUrls[0]} alt={`Carta: ${l.title}`} className="h-full w-full object-contain" />
        ) : (
          <>
            <div
              className="absolute inset-0 opacity-25"
              style={{ background: `radial-gradient(circle at 50% 50%, ${glow} 0%, transparent 65%)` }}
              aria-hidden="true"
            />
            <div
              className={`relative w-20 h-28 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-3xl shadow-2xl`}
              style={{ boxShadow: `0 0 30px ${glow}` }}
              aria-hidden="true"
            >
              🃏
            </div>
          </>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="font-bold text-sm leading-tight" style={{ color: "var(--text-primary)" }}>{l.title}</p>
          {l.condition && (
            <span
              className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.2)" }}
            >
              {l.condition}
            </span>
          )}
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>{gameLabel(l.game)}</p>

        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[10px] mb-0.5" style={{ color: "var(--text-muted)" }}>Precio</p>
            <p className="text-xl font-black" style={{ color: "var(--text-primary)" }}>
              ${(l.price / 100).toLocaleString("es-MX")}{" "}
              <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>MXN</span>
            </p>
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {sellerName} {verified && <span className="text-[var(--accent-text)]">✓</span>}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onBuy(l)}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
          >
            Comprar ahora
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────
export default function TiendaPage() {
  const [listings, setListings] = useState<ApiListing[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch]     = useState("");
  const [condition, setCondition] = useState<ConditionFilter>("all");
  const [sortBy, setSortBy]     = useState<"price-asc" | "price-desc" | "newest">("newest");
  const [buyTarget, setBuyTarget] = useState<ApiListing | null>(null);

  const fetchListings = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    listingsApi.list()
      .then((r) => setListings(r.data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const handleSold = useCallback((id: string) => {
    setListings((prev) => prev.filter((l) => l.id !== id));
    setBuyTarget(null);
  }, []);

  const filtered = listings.filter((l) => {
    const q = search.toLowerCase();
    const matchesSearch =
      q === "" ||
      l.title.toLowerCase().includes(q) ||
      (l.seller?.username ?? "").toLowerCase().includes(q);
    return matchesSearch && matchesCondition(l.condition, condition);
  }).sort((a, b) => {
    if (sortBy === "price-asc") return a.price - b.price;
    if (sortBy === "price-desc") return b.price - a.price;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />

      {buyTarget && (
        <PurchaseModal
          listing={buyTarget}
          onClose={() => setBuyTarget(null)}
          onSold={handleSold}
        />
      )}

      <main id="main">
        <div className="pt-24 pb-8" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h1 className="text-4xl font-black tracking-tight">Tienda</h1>
                <p className="mt-1" style={{ color: "var(--text-muted)" }}>
                  {loading ? "Cargando..." : `${listings.length} cartas disponibles — precio fijo, sin subasta`}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--text-muted)" }} aria-hidden="true">🔍</span>
                  <input
                    type="text"
                    placeholder="Buscar carta o vendedor..."
                    aria-label="Buscar carta o vendedor"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full sm:w-64 rounded-xl pl-9 pr-4 py-3 text-sm placeholder:text-[var(--text-muted)] focus:border-[#2563EB]/60 transition-colors"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                </div>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  aria-label="Ordenar por"
                  className="rounded-xl px-4 py-3 text-sm focus:border-[#2563EB]/60 transition-colors cursor-pointer"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
                >
                  <option value="newest">Más recientes</option>
                  <option value="price-asc">Menor precio</option>
                  <option value="price-desc">Mayor precio</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-6 overflow-x-auto pb-1">
              {CONDITION_FILTERS.map((f) => {
                const count =
                  f.key === "all"
                    ? listings.length
                    : listings.filter((l) => matchesCondition(l.condition, f.key)).length;
                const active = condition === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setCondition(f.key)}
                    aria-pressed={active}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
                    style={
                      active
                        ? { background: "rgba(37,99,235,0.2)", border: "1px solid rgba(37,99,235,0.4)", color: "var(--accent-text)" }
                        : { background: "var(--bg-hover)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }
                    }
                  >
                    {f.label}
                    <span
                      className="text-xs px-1.5 py-0.5 rounded-md"
                      style={{ background: active ? "rgba(37,99,235,0.3)" : "var(--bg-hover)" }}
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
          {loadError ? (
            <div role="alert" className="text-center py-24">
              <p className="text-5xl mb-4" aria-hidden="true">⚠️</p>
              <p className="text-lg font-bold mb-1" style={{ color: "var(--text-secondary)" }}>No se pudo cargar la tienda</p>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                Ocurrió un problema al conectar con el servidor. Intenta de nuevo.
              </p>
              <button
                onClick={fetchListings}
                className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
                style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.3)" }}
              >
                Reintentar
              </button>
            </div>
          ) : loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl overflow-hidden animate-pulse"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                >
                  <div className="h-44" style={{ background: "var(--bg-input)" }} />
                  <div className="p-4 space-y-3">
                    <div className="h-4 rounded w-3/4" style={{ background: "var(--bg-input)" }} />
                    <div className="h-3 rounded w-1/2" style={{ background: "var(--bg-input)" }} />
                    <div className="h-10 rounded mt-4" style={{ background: "var(--bg-input)" }} />
                  </div>
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-24">
              <p className="text-5xl mb-4" aria-hidden="true">🔍</p>
              <p className="text-lg font-bold mb-1" style={{ color: "var(--text-secondary)" }}>Sin resultados</p>
              <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                {search ? `No encontramos cartas para "${search}"` : "No hay cartas disponibles en este momento"}
              </p>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
                  style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)", border: "1px solid rgba(37,99,235,0.3)" }}
                >
                  Limpiar búsqueda
                </button>
              )}
              <p className="text-xs mt-6" style={{ color: "var(--text-muted)" }}>Los vendedores agregan cartas constantemente — vuelve pronto.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((listing, idx) => (
                <ListingCard key={listing.id} listing={listing} idx={idx} onBuy={setBuyTarget} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
