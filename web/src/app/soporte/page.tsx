"use client";

/* Support: report a problem from outside a live, and see what happened with what you
   already reported. Reports raised *inside* a live carry a marker into that live's
   recording; the ones here don't, so they lean on the description instead. */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { apiMessage } from "@/lib/format";
import { useAuth } from "@/contexts/auth";
import { incidentsApi, type ApiIncident, type IncidentKind } from "@/lib/api";

const KINDS: { key: IncidentKind; label: string; hint: string; needsWho: boolean }[] = [
  { key: "no_response",   label: "El vendedor no responde",  hint: "Compraste y no contesta mensajes ni envía.", needsWho: true },
  { key: "seller_report", label: "Denunciar a un vendedor",  hint: "Conducta indebida, cartas no descritas, fraude.", needsWho: true },
  { key: "other",         label: "Otro problema",            hint: "Cuéntanos qué pasó y lo revisamos.", needsWho: false },
];

const STATUS: Record<string, { label: string; color: string }> = {
  open:      { label: "Abierto",     color: "var(--warn)" },
  reviewing: { label: "En revisión", color: "var(--accent-text)" },
  resolved:  { label: "Resuelto",    color: "var(--success)" },
  dismissed: { label: "Cerrado",     color: "var(--text-muted)" },
};

function when(iso: string) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

export default function SoportePage() {
  const { user } = useAuth();
  const [kind, setKind] = useState<IncidentKind>("no_response");
  const [who, setWho] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [mine, setMine] = useState<ApiIncident[]>([]);

  const load = useCallback(() => {
    if (!user) return;
    incidentsApi.mine().then(r => setMine(r.data)).catch(() => {});
  }, [user]);
  useEffect(() => { load(); }, [load]);

  const selected = KINDS.find(k => k.key === kind)!;

  async function submit() {
    setError("");
    if (!text.trim()) { setError("Cuéntanos qué pasó."); return; }
    if (selected.needsWho && !who.trim()) { setError("Escribe el usuario del vendedor."); return; }
    setSending(true);
    try {
      await incidentsApi.create({
        kind,
        description: text.trim(),
        reportedUsername: selected.needsWho ? who.trim().replace(/^@/, "") : undefined,
      });
      setText(""); setWho(""); setSent(true);
      load();
    } catch (e) {
      setError(apiMessage(e, "No se pudo enviar el reporte."));
    } finally { setSending(false); }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />
      <main id="main" className="mx-auto max-w-2xl px-6 pt-28 pb-20">
        <div className="text-[11px] font-medium uppercase" style={{ letterSpacing: "0.16em", color: "var(--text-muted)" }}>Ayuda</div>
        <h1 className="mt-2 text-3xl font-medium tracking-[-0.025em]">Contactar a soporte</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          Si el problema ocurrió durante una transmisión, repórtalo desde el menú del live:
          así queda marcado el momento exacto en la grabación.
        </p>

        {!user ? (
          <div className="mt-8 rounded-2xl p-6 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>Inicia sesión para enviar un reporte.</p>
            <Link href="/login" className="inline-block px-5 py-2.5 rounded-full text-sm font-semibold"
              style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>Iniciar sesión</Link>
          </div>
        ) : (
          <>
            <div className="mt-8 rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
              <div className="p-5 space-y-4">
                <div className="space-y-2">
                  {KINDS.map(k => (
                    <button key={k.key} type="button" onClick={() => { setKind(k.key); setSent(false); }}
                      className="w-full text-left rounded-xl p-3"
                      style={kind === k.key
                        ? { background: "var(--bg-hover)", border: "1.5px solid var(--border-brand)" }
                        : { background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{k.label}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{k.hint}</p>
                    </button>
                  ))}
                </div>

                {selected.needsWho && (
                  <div>
                    <label htmlFor="who" className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
                      Usuario del vendedor
                    </label>
                    <input id="who" value={who} onChange={e => setWho(e.target.value)} placeholder="@vendedor" maxLength={40}
                      className="w-full rounded-xl px-3 py-2.5 text-sm"
                      style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }} />
                  </div>
                )}

                <div>
                  <label htmlFor="desc" className="block text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-muted)" }}>
                    ¿Qué pasó?
                  </label>
                  <textarea id="desc" value={text} onChange={e => { setText(e.target.value); setSent(false); }}
                    rows={5} maxLength={2000} placeholder="Cuéntanos con detalle. Si hay una orden involucrada, menciónala."
                    className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }} />
                </div>

                {error && <p className="text-xs" style={{ color: "var(--error-text)" }}>{error}</p>}
                {sent && <p className="text-xs" style={{ color: "var(--success)" }}>Reporte enviado. Te avisamos cuando lo revisemos.</p>}

                <button type="button" onClick={submit} disabled={sending || !text.trim()}
                  className="w-full py-3 rounded-xl text-sm font-black disabled:opacity-50"
                  style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}>
                  {sending ? "Enviando…" : "Enviar reporte"}
                </button>
              </div>
            </div>

            {mine.length > 0 && (
              <div className="mt-10">
                <h2 className="text-lg font-medium mb-3">Tus reportes</h2>
                <div className="space-y-2">
                  {mine.map(i => {
                    const st = STATUS[i.status] ?? STATUS.open;
                    return (
                      <div key={i.id} className="rounded-2xl p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ color: st.color, background: "var(--bg-elevated)" }}>{st.label}</span>
                          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{when(i.createdAt)}</span>
                        </div>
                        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{i.description}</p>
                        {i.reportedUsername && (
                          <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>Sobre @{i.reportedUsername}</p>
                        )}
                        {i.adminNote && (
                          <p className="text-xs mt-2 pt-2" style={{ color: "var(--text-primary)", borderTop: "1px solid var(--border-subtle)" }}>
                            <span style={{ color: "var(--text-muted)" }}>Respuesta de soporte: </span>{i.adminNote}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
