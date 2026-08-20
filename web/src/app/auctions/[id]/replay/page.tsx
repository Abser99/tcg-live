"use client";

/* Replay timeline for a finished (or running) live.

   The same screen serves both roles — the API decides what's visible: a seller sees
   every lot of the session, a buyer only the lots they won. Offsets are seconds into
   the recording, so a marker points at the exact moment a bid landed. */

import { useEffect, useState, use } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { auctionsApi, type ApiSegments, type ApiSegment } from "@/lib/api";

const money = (cents: number) => `$${(cents / 100).toLocaleString("es-MX")}`;

/** Seconds into the recording as m:ss (or h:mm:ss for long sessions). */
function stamp(sec: number | null): string {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function SegmentCard({ seg, role }: { seg: ApiSegment; role: string }) {
  const span = (seg.endOffsetSec ?? 0) - (seg.startOffsetSec ?? 0);
  const img = seg.imageUrls?.[0];
  // Bid markers are positioned along the lot's own window, so they read as
  // "where inside this lot" rather than "where inside the whole session".
  const pos = (o: number | null) =>
    o == null || span <= 0 ? 0 : Math.min(100, Math.max(0, ((o - (seg.startOffsetSec ?? 0)) / span) * 100));

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <div className="p-4 flex items-start gap-3">
        <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
          {img
            ? <img src={img} alt="" className="h-full w-auto object-contain" />
            : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-muted)" strokeWidth={1.3}><rect x="4" y="3" width="16" height="18" rx="2" /></svg>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold truncate" style={{ color: "var(--text-primary)" }}>{seg.cardName}</p>
            {seg.wonByViewer && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>TU COMPRA</span>
            )}
          </div>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {stamp(seg.startOffsetSec)} – {stamp(seg.endOffsetSec)} · {seg.bids.length} {seg.bids.length === 1 ? "puja" : "pujas"}
            {seg.winner && <> · ganó <span style={{ color: "var(--accent-text)" }}>@{seg.winner.username}</span></>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Final</p>
          <p className="font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{money(seg.finalPrice)}</p>
        </div>
      </div>

      {/* The lot's window, with a marker per bid */}
      <div className="px-4 pb-2">
        <div className="relative h-9">
          <div className="absolute inset-x-0 top-4 h-1 rounded-full" style={{ background: "var(--bg-elevated)" }} />
          {seg.bids.map((b) => (
            <div key={b.id} className="absolute -translate-x-1/2 group" style={{ left: `${pos(b.offsetSec)}%`, top: 6 }}>
              <div className="w-2.5 h-2.5 rounded-full cursor-help"
                style={{
                  background: b.isViewer ? "var(--brand-light)" : b.auto ? "var(--text-muted)" : "var(--accent-text)",
                  border: "2px solid var(--bg-surface)",
                  boxShadow: b.isViewer ? "0 0 0 2px var(--border-brand)" : undefined,
                }}
                title={`${stamp(b.offsetSec)} · @${b.username} · ${money(b.amount)}${b.auto ? " (automática)" : ""}`} />
            </div>
          ))}
        </div>
      </div>

      {/* Bid list — the marker detail in text, which is what you actually read */}
      <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
        {seg.bids.length === 0 ? (
          <p className="px-4 py-3 text-xs" style={{ color: "var(--text-muted)" }}>Nadie pujó en este lote.</p>
        ) : (
          <div className="max-h-52 overflow-y-auto">
            {seg.bids.map((b) => (
              <div key={b.id} className="px-4 py-2 flex items-center gap-3 text-sm"
                style={{ borderBottom: "1px solid var(--border-subtle)", background: b.isViewer ? "var(--bg-hover)" : "transparent" }}>
                <span className="font-mono text-xs tabular-nums shrink-0 px-1.5 py-0.5 rounded"
                  style={{ background: "var(--bg-elevated)", color: "var(--accent-text)" }}>{stamp(b.offsetSec)}</span>
                <span className="flex-1 min-w-0 truncate" style={{ color: "var(--text-secondary)" }}>
                  @{b.username}{b.isViewer && <span style={{ color: "var(--accent-text)" }}> (tú)</span>}
                  {b.auto && <span className="text-[10px] ml-1" style={{ color: "var(--text-muted)" }}>automática</span>}
                </span>
                <span className="font-semibold tabular-nums shrink-0" style={{ color: "var(--text-primary)" }}>{money(b.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<ApiSegments | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auctionsApi.segments(id)
      .then(r => setData(r.data))
      .catch(e => setError(e?.response?.data?.message ?? "No se pudo cargar la grabación."))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />
      <main id="main" className="mx-auto max-w-3xl px-6 pt-28 pb-20">
        <Link href="/compras" className="text-sm" style={{ color: "var(--text-secondary)" }}>← Mis compras</Link>

        <div className="mt-4 mb-8">
          <div className="text-[11px] font-medium uppercase" style={{ letterSpacing: "0.16em", color: "var(--text-muted)" }}>
            Grabación de la subasta
          </div>
          <h1 className="mt-2 text-3xl font-medium tracking-[-0.025em]">{data?.title ?? "…"}</h1>
          {data?.seller && (
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              @{data.seller.username}
              {data.durationSec != null && <> · duración {stamp(data.durationSec)}</>}
              {data.viewerRole === "seller" && " · vista de vendedor"}
            </p>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-32 rounded-2xl shimmer" style={{ border: "1px solid var(--border)" }} />)}</div>
        ) : error ? (
          <div role="alert" className="rounded-2xl p-6 text-center" style={{ border: "1px solid var(--border)" }}>
            <p style={{ color: "var(--error-text)" }}>{error}</p>
          </div>
        ) : (
          <>
            {data?.recordingUrl ? (
              <video src={data.recordingUrl} controls className="w-full rounded-2xl mb-6"
                style={{ background: "#000", border: "1px solid var(--border)" }} />
            ) : (
              <div className="rounded-2xl px-4 py-3 mb-6 text-xs" style={{ background: "var(--bg-elevated)", border: "1px dashed var(--border)", color: "var(--text-muted)" }}>
                El video de esta sesión aún no está disponible. Las marcas de tiempo de cada
                puja sí quedaron registradas y apuntarán al momento exacto en cuanto lo esté.
              </div>
            )}

            <div className="space-y-3">
              {(data?.segments ?? []).map(seg => <SegmentCard key={seg.itemId} seg={seg} role={data!.viewerRole} />)}
              {data?.segments.length === 0 && (
                <p className="text-sm text-center py-12" style={{ color: "var(--text-muted)" }}>
                  Esta subasta no tiene lotes con pujas registradas.
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
