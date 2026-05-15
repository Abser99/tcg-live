"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import {
  sellerApplicationsApi, sellerDocumentsApi,
  type SellerApplication, type SellerDocumentRecord,
} from "@/lib/api";

const DOC_LABELS: Record<string, string> = {
  identificacion:        "Identificación Oficial",
  curp:                  "CURP",
  constancia_fiscal:     "Constancia de Situación Fiscal",
  opinion_cumplimiento:  "Opinión de Cumplimiento SAT",
  comprobante_domicilio: "Comprobante de Domicilio",
  cuenta_bancaria:       "Cuenta Bancaria / CLABE",
};

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  pending:  { label: "Pendiente", color: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  approved: { label: "Aprobado",  color: "#4ade80", bg: "rgba(74,222,128,0.12)" },
  rejected: { label: "Rechazado", color: "#f87171", bg: "rgba(248,113,113,0.12)" },
};

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [documents,    setDocuments]    = useState<SellerDocumentRecord[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState<"applications" | "documents">("applications");
  const [filter,       setFilter]       = useState("pending");
  const [selected,     setSelected]     = useState<SellerApplication | null>(null);
  const [rejectNote,   setRejectNote]   = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [docPreview,   setDocPreview]   = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || user.role !== "ADMIN")) router.replace("/");
  }, [authLoading, user, router]);

  const loadData = useCallback(async () => {
    if (!user || user.role !== "ADMIN") return;
    setLoading(true);
    try {
      const [appsRes, docsRes] = await Promise.all([
        sellerApplicationsApi.list(filter === "all" ? undefined : filter),
        sellerDocumentsApi.listAll(filter === "all" ? undefined : filter),
      ]);
      setApplications(appsRes.data);
      setDocuments(docsRes.data);
    } finally {
      setLoading(false);
    }
  }, [user, filter]);

  useEffect(() => { loadData(); }, [loadData]);

  async function reviewApplication(id: string, status: "approved" | "rejected") {
    setActionLoading(true);
    try {
      await sellerApplicationsApi.review(id, status, status === "rejected" ? rejectNote : undefined);
      setSelected(null);
      setRejectNote("");
      await loadData();
    } finally {
      setActionLoading(false);
    }
  }

  async function reviewDocument(id: string, status: "approved" | "rejected", note?: string) {
    setActionLoading(true);
    try {
      await sellerDocumentsApi.review(id, status, note);
      await loadData();
    } finally {
      setActionLoading(false);
    }
  }

  if (authLoading || !user) return null;
  if (user.role !== "ADMIN") return null;

  const pendingApps = applications.filter(a => a.status === "pending").length;
  const pendingDocs = documents.filter(d => d.status === "pending").length;

  return (
    <div className="min-h-screen bg-[#0F0F14] text-white">
      <Navbar />

      <div className="pt-24 pb-0 border-b border-white/5">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-black">Panel de Administración</h1>
              <p className="text-zinc-500 text-sm mt-1">Revisión de solicitudes y documentos KYC</p>
            </div>
            <div className="flex gap-2">
              {(["pending", "approved", "rejected", "all"] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg transition-all capitalize"
                  style={filter === f
                    ? { background: "rgba(108,58,232,0.25)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.4)" }
                    : { background: "rgba(255,255,255,0.04)", color: "#71717a", border: "1px solid transparent" }}>
                  {f === "all" ? "Todos" : f === "pending" ? "Pendientes" : f === "approved" ? "Aprobados" : "Rechazados"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-1 mt-6">
            {[
              { key: "applications", label: "Solicitudes de Vendedor", count: pendingApps },
              { key: "documents",    label: "Documentos KYC",          count: pendingDocs },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-semibold border-b-2 transition-all"
                style={tab === t.key
                  ? { color: "#a78bfa", borderColor: "#6C3AE8", background: "rgba(108,58,232,0.08)" }
                  : { color: "#71717a", borderColor: "transparent" }}>
                {t.label}
                {t.count > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                    style={{ background: "rgba(245,158,11,0.2)", color: "#f59e0b" }}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 rounded-full border-2 border-[#6C3AE8] border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* ── SOLICITUDES ── */}
            {tab === "applications" && (
              <div className="space-y-3">
                {applications.length === 0 && (
                  <div className="text-center py-16 text-zinc-500">No hay solicitudes {filter !== "all" ? filter === "pending" ? "pendientes" : filter : ""}</div>
                )}
                {applications.map(app => {
                  const s = STATUS_STYLE[app.status];
                  const userDocs = documents.filter(d => d.userId === app.userId);
                  return (
                    <div key={app.id} className="rounded-2xl p-5" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <p className="font-black text-base">{app.fullName}</p>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                          </div>
                          <p className="text-xs text-zinc-500 mt-1">
                            @{app.user?.username ?? "—"} · {app.user?.email ?? "—"} · {app.state}
                          </p>
                          <p className="text-sm text-zinc-300 mt-3 leading-relaxed">{app.description}</p>
                          <p className="text-[11px] text-zinc-600 mt-2">
                            Solicitado: {new Date(app.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}
                          </p>
                          {app.reviewNote && (
                            <p className="text-xs text-red-400 mt-2">Nota: {app.reviewNote}</p>
                          )}
                        </div>

                        {app.status === "pending" && (
                          <div className="flex flex-col gap-2 shrink-0">
                            <button onClick={() => reviewApplication(app.id, "approved")} disabled={actionLoading}
                              className="text-xs font-black px-5 py-2.5 rounded-xl disabled:opacity-50"
                              style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
                              ✓ Aprobar
                            </button>
                            <button onClick={() => setSelected(app)}
                              className="text-xs font-black px-5 py-2.5 rounded-xl"
                              style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                              ✕ Rechazar
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Documentos del usuario */}
                      {userDocs.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/5">
                          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-3">Documentos subidos</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {userDocs.map(doc => {
                              const ds = STATUS_STYLE[doc.status];
                              const isPDF = doc.fileUrl?.toLowerCase().includes(".pdf") || doc.fileUrl?.includes("/raw/");
                              return (
                                <div key={doc.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${ds.color}22` }}>
                                  <p className="text-[11px] font-bold truncate mb-1">{DOC_LABELS[doc.documentType] ?? doc.documentType}</p>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: ds.bg, color: ds.color }}>{ds.label}</span>
                                  {doc.emissionDate && <p className="text-[10px] text-zinc-600 mt-1">Emisión: {doc.emissionDate}</p>}
                                  <div className="flex gap-1 mt-2">
                                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                                      className="text-[10px] font-bold px-2 py-1 rounded-lg"
                                      style={{ background: "rgba(108,58,232,0.2)", color: "#a78bfa" }}>
                                      {isPDF ? "Ver PDF" : "Ver"}
                                    </a>
                                    {doc.status === "pending" && (
                                      <>
                                        <button onClick={() => reviewDocument(doc.id, "approved")} disabled={actionLoading}
                                          className="text-[10px] font-bold px-2 py-1 rounded-lg disabled:opacity-50"
                                          style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80" }}>✓</button>
                                        <button onClick={() => reviewDocument(doc.id, "rejected")} disabled={actionLoading}
                                          className="text-[10px] font-bold px-2 py-1 rounded-lg disabled:opacity-50"
                                          style={{ background: "rgba(248,113,113,0.12)", color: "#f87171" }}>✕</button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── DOCUMENTOS KYC ── */}
            {tab === "documents" && (
              <div className="space-y-2">
                {documents.length === 0 && (
                  <div className="text-center py-16 text-zinc-500">No hay documentos</div>
                )}
                {documents.map(doc => {
                  const s = STATUS_STYLE[doc.status];
                  return (
                    <div key={doc.id} className="flex items-center gap-4 rounded-2xl p-4 flex-wrap" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-sm">{DOC_LABELS[doc.documentType] ?? doc.documentType}</p>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{s.label}</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">@{doc.user?.username ?? "—"} · {doc.user?.email ?? "—"}</p>
                        {doc.emissionDate && <p className="text-[11px] text-zinc-600 mt-0.5">Emisión: {doc.emissionDate}</p>}
                        {doc.rejectionNote && <p className="text-xs text-red-400 mt-1">Rechazado: {doc.rejectionNote}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-bold px-4 py-2 rounded-xl"
                          style={{ background: "rgba(108,58,232,0.2)", color: "#a78bfa", border: "1px solid rgba(108,58,232,0.3)" }}>
                          Ver documento
                        </a>
                        {doc.status === "pending" && (
                          <>
                            <button onClick={() => reviewDocument(doc.id, "approved")} disabled={actionLoading}
                              className="text-xs font-black px-4 py-2 rounded-xl disabled:opacity-50"
                              style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>
                              ✓ Aprobar
                            </button>
                            <button onClick={() => reviewDocument(doc.id, "rejected")} disabled={actionLoading}
                              className="text-xs font-black px-4 py-2 rounded-xl disabled:opacity-50"
                              style={{ background: "rgba(248,113,113,0.12)", color: "#f87171", border: "1px solid rgba(248,113,113,0.3)" }}>
                              ✕ Rechazar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal rechazar solicitud */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div className="w-full max-w-md rounded-2xl p-6" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h3 className="font-black text-lg mb-1">Rechazar solicitud</h3>
            <p className="text-sm text-zinc-500 mb-4">@{selected.user?.username} — {selected.fullName}</p>
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3}
              placeholder="Motivo del rechazo (se le mostrará al usuario)..."
              className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-red-500/50 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => { setSelected(null); setRejectNote(""); }}
                className="flex-1 py-3 rounded-xl font-bold text-zinc-400 text-sm"
                style={{ background: "rgba(255,255,255,0.05)" }}>
                Cancelar
              </button>
              <button onClick={() => reviewApplication(selected.id, "rejected")} disabled={actionLoading || !rejectNote.trim()}
                className="flex-1 py-3 rounded-xl font-black text-white text-sm disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)" }}>
                {actionLoading ? "..." : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {docPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 cursor-zoom-out" style={{ background: "rgba(0,0,0,0.9)" }} onClick={() => setDocPreview(null)}>
          <img src={docPreview} alt="Documento" className="max-w-full max-h-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}
