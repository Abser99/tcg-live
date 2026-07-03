"use client";

import { useState, useEffect, useCallback } from "react";
import Navbar from "@/components/Navbar";
import { listingsApi, paymentsApi, type ApiListing, type ApiOrder } from "@/lib/api";

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
  "rgba(139,92,246,0.4)",
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
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <p className="font-bold text-white text-sm">Confirmar compra</p>
          {step === "confirm" && (
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-white transition-colors text-lg leading-none"
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
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="w-14 h-20 rounded-lg overflow-hidden shrink-0 bg-[#0d0d1a] flex items-center justify-center">
              {listing.imageUrls?.[0] ? (
                <img src={listing.imageUrls[0]} alt={listing.title} className="w-full h-full object-contain" />
              ) : (
                <span className="text-2xl">🃏</span>
              )}
            </div>
            <div className="flex flex-col justify-center min-w-0">
              <p className="font-bold text-white text-sm leading-tight truncate">{listing.title}</p>
              {listing.condition && (
                <span className="text-[10px] text-[#a78bfa] mt-1">{listing.condition}</span>
              )}
              <p className="text-xs text-zinc-500 mt-1">
                {sellerName}{verified && <span className="text-[#a78bfa] ml-1">✓</span>}
              </p>
              <p className="text-xl font-black text-white mt-2">
                ${(listing.price / 100).toLocaleString("es-MX")}{" "}
                <span className="text-xs text-zinc-500 font-normal">MXN</span>
              </p>
            </div>
          </div>

          {step === "confirm" && (
            <>
              <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
                Al confirmar serás redirigido a Mercado Pago para completar el pago de forma segura.
                Una vez pagado, el vendedor coordinará el envío contigo.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-zinc-400 transition-all hover:bg-white/5"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
                  style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                >
                  Ir a pagar →
                </button>
              </div>
            </>
          )}

          {(step === "loading" || step === "redirecting") && (
            <div className="text-center py-4">
              <div
                className="w-8 h-8 rounded-full border-2 border-[#6C3AE8] border-t-transparent animate-spin mx-auto mb-3"
              />
              <p className="text-sm text-zinc-400">
                {step === "loading" ? "Procesando..." : "Redirigiendo a Mercado Pago..."}
              </p>
            </div>
          )}

          {step === "error" && (
            <>
              <div
                className="p-3 rounded-xl mb-4 text-sm text-red-400"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                {error}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-zinc-400 hover:bg-white/5 transition-all"
                  style={{ border: "1px solid rgba(255,255,255,0.1)" }}
                >
                  Cerrar
                </button>
                <button
                  onClick={() => { setStep("confirm"); setError(""); }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all"
                  style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
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
      style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="relative h-44 bg-[#0d0d1a] flex items-center justify-center overflow-hidden">
        {l.imageUrls?.[0] ? (
          <img src={l.imageUrls[0]} alt={l.title} className="h-full w-full object-contain" />
        ) : (
          <>
            <div
              className="absolute inset-0 opacity-25"
              style={{ background: `radial-gradient(circle at 50% 50%, ${glow} 0%, transparent 65%)` }}
            />
            <div
              className={`relative w-20 h-28 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-3xl shadow-2xl`}
              style={{ boxShadow: `0 0 30px ${glow}` }}
            >
              🃏
            </div>
          </>
        )}

        {l.acceptsOffers && (
          <div className="absolute top-3 right-3 bg-[#6C3AE8]/80 text-white text-[10px] font-bold px-2 py-1 rounded-full">
            Acepta ofertas
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="font-bold text-white text-sm leading-tight">{l.title}</p>
          {l.condition && (
            <span
              className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.2)" }}
            >
              {l.condition}
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-500 mb-3">{l.game ?? ""}</p>

        <div className="flex items-end justify-between mb-4">
          <div>
            <p className="text-[10px] text-zinc-600 mb-0.5">Precio</p>
            <p className="text-xl font-black text-white">
              ${(l.price / 100).toLocaleString("es-MX")}{" "}
              <span className="text-xs text-zinc-500 font-normal">MXN</span>
            </p>
          </div>
          <p className="text-xs text-zinc-500">
            {sellerName} {verified && <span className="text-[#a78bfa]">✓</span>}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => onBuy(l)}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white transition-all active:scale-95"
            style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
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
  const [search, setSearch]     = useState("");
  const [condition, setCondition] = useState<ConditionFilter>("all");
  const [sortBy, setSortBy]     = useState<"price-asc" | "price-desc" | "newest">("newest");
  const [buyTarget, setBuyTarget] = useState<ApiListing | null>(null);

  useEffect(() => {
    listingsApi.list()
      .then((r) => setListings(r.data))
      .catch(() => setListings([]))
      .finally(() => setLoading(false));
  }, []);

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
    <div className="min-h-screen bg-[#0F0F14] text-white">
      <Navbar />

      {buyTarget && (
        <PurchaseModal
          listing={buyTarget}
          onClose={() => setBuyTarget(null)}
          onSold={handleSold}
        />
      )}

      <div className="pt-24 pb-8 border-b border-white/5">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-black tracking-tight">Tienda</h1>
              <p className="text-zinc-500 mt-1">
                {loading ? "Cargando..." : `${listings.length} cartas disponibles — precio fijo, sin subasta`}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">🔍</span>
                <input
                  type="text"
                  placeholder="Buscar carta o vendedor..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full sm:w-64 bg-[#16161E] border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors"
                />
              </div>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="bg-[#16161E] border border-white/10 rounded-xl px-4 py-3 text-sm text-zinc-300 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors cursor-pointer"
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
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all"
                  style={
                    active
                      ? { background: "rgba(108,58,232,0.2)", border: "1px solid rgba(108,58,232,0.4)", color: "#a78bfa" }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#71717a" }
                  }
                >
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
          <div className="text-center py-24">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-lg font-bold text-zinc-300 mb-1">Sin resultados</p>
            <p className="text-sm text-zinc-600 mb-6">
              {search ? `No encontramos cartas para "${search}"` : "No hay cartas disponibles en este momento"}
            </p>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
                style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.3)" }}
              >
                Limpiar búsqueda
              </button>
            )}
            <p className="text-xs text-zinc-700 mt-6">Los vendedores agregan cartas constantemente — vuelve pronto.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((listing, idx) => (
              <ListingCard key={listing.id} listing={listing} idx={idx} onBuy={setBuyTarget} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
