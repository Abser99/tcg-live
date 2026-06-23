"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import { usersApi, sellerApplicationsApi, sellerDocumentsApi, type ApiUser, type SellerApplication, type SellerDocumentRecord } from "@/lib/api";
import { uploadToCloudinary } from "@/lib/cloudinary";
import { useAnalytics } from "@/hooks/useAnalytics";

const REQUIRED_DOCS: { type: string; label: string; hint: string; needsDate: boolean }[] = [
  { type: "identificacion",        label: "Identificación Oficial",         hint: "INE o Pasaporte vigente",                            needsDate: false },
  { type: "curp",                  label: "CURP",                           hint: "Documento CURP actualizado",                         needsDate: false },
  { type: "constancia_fiscal",     label: "Constancia de Situación Fiscal", hint: "Del SAT, debe ser del mes en curso",                  needsDate: true  },
  { type: "opinion_cumplimiento",  label: "Opinión de Cumplimiento SAT",    hint: "Positiva, del mes en curso",                         needsDate: true  },
  { type: "comprobante_domicilio", label: "Comprobante de Domicilio",       hint: "Máximo 3 meses de antigüedad (luz, agua, etc.)",     needsDate: true  },
  { type: "cuenta_bancaria",       label: "Cuenta Bancaria / CLABE",        hint: "Estado de cuenta o carátula con CLABE interbancaria", needsDate: false },
];

const ESTADOS_MX = ["Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua","Ciudad de México","Coahuila","Colima","Durango","Guanajuato","Guerrero","Hidalgo","Jalisco","México","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas"];

type Section = "cuenta" | "seguridad" | "direccion" | "pago" | "notificaciones" | "verificacion";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "cuenta",         label: "Información personal", icon: "👤" },
  { key: "verificacion",   label: "Cuenta de vendedor",    icon: "🏪" },
  { key: "seguridad",      label: "Contraseña",            icon: "🔒" },
  { key: "direccion",      label: "Dirección de envío",    icon: "📦" },
  { key: "pago",           label: "Forma de pago",         icon: "💳" },
  { key: "notificaciones", label: "Notificaciones",         icon: "🔔" },
];

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-6" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
      <h2 className="text-base font-black mb-5">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-zinc-400 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-zinc-600 mt-1">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", readOnly = false }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; readOnly?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 disabled:opacity-50"
      style={readOnly ? { opacity: 0.5, cursor: "not-allowed" } : {}}
    />
  );
}

function SaveButton({ loading, saved, onClick }: { loading: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="px-6 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-60 transition-all"
      style={{
        background: saved
          ? "linear-gradient(135deg, #059669, #10b981)"
          : "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
        boxShadow: "0 4px 16px rgba(108,58,232,0.3)",
      }}
    >
      {loading ? "Guardando..." : saved ? "✓ Guardado" : "Guardar cambios"}
    </button>
  );
}

export default function AjustesPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const { capture } = useAnalytics();
  const [activeSection, setActiveSection] = useState<Section>("cuenta");

  // Full user data (includes address fields)
  const [fullUser, setFullUser]   = useState<ApiUser | null>(null);
  const [application, setApplication] = useState<SellerApplication | null | undefined>(undefined);
  const [myDocs, setMyDocs]       = useState<SellerDocumentRecord[] | null>(null);

  // Seller application modal
  const [showSellerModal, setShowSellerModal] = useState(false);
  const [sellerStep, setSellerStep]           = useState<1 | 2>(1);
  const [sellerForm, setSellerForm]           = useState({ fullName: "", state: "", description: "" });
  const [docUrls, setDocUrls]                 = useState<Record<string, string>>({});
  const [docDates, setDocDates]               = useState<Record<string, string>>({});
  const [docUploading, setDocUploading]       = useState<Record<string, boolean>>({});
  const [sellerSubmitting, setSellerSubmitting] = useState(false);
  const [sellerError, setSellerError]         = useState("");

  // Doc re-upload (for SELLER with expired/rejected docs)
  const [reuploadUrls, setReuploadUrls]     = useState<Record<string, string>>({});
  const [reuploadDates, setReuploadDates]   = useState<Record<string, string>>({});
  const [reuploadBusy, setReuploadBusy]     = useState<Record<string, boolean>>({});
  const [reuploadDone, setReuploadDone]     = useState<Record<string, boolean>>({});
  const [reuploadError, setReuploadError]   = useState<Record<string, string>>({});

  // Profile form
  const [profileForm, setProfileForm] = useState({ username: "", displayName: "" });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Password form
  const [passForm, setPassForm] = useState({ current: "", next: "", confirm: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [passSaved, setPassSaved] = useState(false);
  const [passError, setPassError] = useState("");

  // Address form
  const [addrForm, setAddrForm] = useState({ street: "", colonia: "", city: "", state: "", zipCode: "" });
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrSaved, setAddrSaved] = useState(false);
  const [addrError, setAddrError] = useState("");

  // Payout info form
  const [payoutForm, setPayoutForm] = useState({ clabe: "", mpPayoutEmail: "" });
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSaved, setPayoutSaved] = useState(false);
  const [payoutError, setPayoutError] = useState("");

  // Notification prefs (localStorage)
  const [notifs, setNotifs] = useState({
    outbid:    true,
    orderUpdate: true,
    newMessage:  true,
    promotions:  false,
  });

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!showSellerModal) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setShowSellerModal(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showSellerModal]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      usersApi.me().catch(() => null),
      sellerApplicationsApi.myApplication().catch(() => null),
      sellerDocumentsApi.myDocuments().catch(() => null),
    ]).then(([meRes, appRes, docsRes]) => {
      if (meRes) {
        setFullUser(meRes.data);
        setProfileForm({ username: meRes.data.username, displayName: meRes.data.displayName ?? "" });
        if (meRes.data.avatarUrl) setAvatarUrl(meRes.data.avatarUrl);
        setAddrForm({
          street:  meRes.data.street  ?? "",
          colonia: meRes.data.colonia ?? "",
          city:    meRes.data.city    ?? "",
          state:   meRes.data.state   ?? "",
          zipCode: meRes.data.zipCode ?? "",
        });
        setPayoutForm({
          clabe:        meRes.data.clabe        ?? "",
          mpPayoutEmail: meRes.data.mpPayoutEmail ?? "",
        });
      }
      setApplication(appRes?.data ?? null);
      if (docsRes) setMyDocs(docsRes.data);
    });

    // Load notification prefs from localStorage
    try {
      const saved = localStorage.getItem("tcg_notifs");
      if (saved) setNotifs(JSON.parse(saved));
    } catch {}
  }, [user]);

  async function handleAvatarUpload(file: File) {
    setAvatarUploading(true);
    setProfileError("");
    try {
      const url = await uploadToCloudinary(file, "tcg-live/avatars", "image");
      setAvatarUrl(url);
      await usersApi.updateProfile({ avatarUrl: url });
    } catch {
      setProfileError("Error al subir foto. Intenta de nuevo.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function saveProfile() {
    setProfileError("");
    setProfileLoading(true);
    setProfileSaved(false);
    try {
      await usersApi.updateProfile({ username: profileForm.username, displayName: profileForm.displayName });
      capture("profile_updated");
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (e: any) {
      setProfileError(e?.response?.data?.message ?? "Error al guardar");
    } finally {
      setProfileLoading(false);
    }
  }

  async function savePassword() {
    setPassError("");
    if (passForm.next !== passForm.confirm) {
      setPassError("Las contraseñas no coinciden");
      return;
    }
    if (passForm.next.length < 8) {
      setPassError("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    setPassLoading(true);
    setPassSaved(false);
    try {
      await usersApi.changePassword(passForm.current, passForm.next);
      setPassForm({ current: "", next: "", confirm: "" });
      setPassSaved(true);
      setTimeout(() => setPassSaved(false), 3000);
    } catch (e: any) {
      setPassError(e?.response?.data?.message ?? "Error al cambiar contraseña");
    } finally {
      setPassLoading(false);
    }
  }

  async function saveAddress() {
    setAddrError("");
    if (addrForm.zipCode && !/^\d{5}$/.test(addrForm.zipCode)) {
      setAddrError("Código postal debe tener 5 dígitos");
      return;
    }
    setAddrLoading(true);
    setAddrSaved(false);
    try {
      await usersApi.updateAddress(addrForm);
      setAddrSaved(true);
      setTimeout(() => setAddrSaved(false), 3000);
    } catch (e: any) {
      setAddrError(e?.response?.data?.message ?? "Error al guardar dirección");
    } finally {
      setAddrLoading(false);
    }
  }

  async function savePayout() {
    setPayoutError("");
    if (payoutForm.clabe && !/^\d{18}$/.test(payoutForm.clabe)) {
      setPayoutError("La CLABE debe tener exactamente 18 dígitos.");
      return;
    }
    setPayoutLoading(true);
    setPayoutSaved(false);
    try {
      const payload: { clabe?: string; mpPayoutEmail?: string } = {};
      if (payoutForm.clabe)         payload.clabe         = payoutForm.clabe;
      if (payoutForm.mpPayoutEmail) payload.mpPayoutEmail = payoutForm.mpPayoutEmail;
      await usersApi.updatePayoutInfo(payload);
      setPayoutSaved(true);
      setTimeout(() => setPayoutSaved(false), 3000);
    } catch (e: any) {
      setPayoutError(e?.response?.data?.message ?? "Error al guardar datos de cobro");
    } finally {
      setPayoutLoading(false);
    }
  }

  function saveNotifs(updated: typeof notifs) {
    setNotifs(updated);
    localStorage.setItem("tcg_notifs", JSON.stringify(updated));
  }

  async function handleDocUpload(type: string, file: File, forReupload: boolean) {
    if (forReupload) {
      setReuploadBusy(p => ({ ...p, [type]: true }));
      setReuploadError(p => ({ ...p, [type]: "" }));
      try {
        const url = await uploadToCloudinary(file, "tcg-live/seller-docs", "auto");
        setReuploadUrls(p => ({ ...p, [type]: url }));
      } catch { setReuploadError(p => ({ ...p, [type]: "Error al subir. Intenta de nuevo." })); }
      finally { setReuploadBusy(p => ({ ...p, [type]: false })); }
    } else {
      setDocUploading(p => ({ ...p, [type]: true }));
      setSellerError("");
      try {
        const url = await uploadToCloudinary(file, "tcg-live/seller-docs", "auto");
        setDocUrls(p => ({ ...p, [type]: url }));
      } catch { setSellerError("Error al subir archivo. Intenta de nuevo."); }
      finally { setDocUploading(p => ({ ...p, [type]: false })); }
    }
  }

  async function handleReuploadSubmit(type: string) {
    const url = reuploadUrls[type];
    if (!url) return;
    const docDef = REQUIRED_DOCS.find(d => d.type === type);
    if (docDef?.needsDate && !reuploadDates[type]) {
      setReuploadError(p => ({ ...p, [type]: "Ingresa la fecha de emisión" }));
      return;
    }
    setReuploadBusy(p => ({ ...p, [type]: true }));
    try {
      await sellerDocumentsApi.uploadFromUrl(type, url, reuploadDates[type]);
      setReuploadDone(p => ({ ...p, [type]: true }));
      const docsRes = await sellerDocumentsApi.myDocuments().catch(() => null);
      if (docsRes) setMyDocs(docsRes.data);
    } catch (e: any) {
      setReuploadError(p => ({ ...p, [type]: e?.response?.data?.message ?? "Error al guardar" }));
    } finally {
      setReuploadBusy(p => ({ ...p, [type]: false }));
    }
  }

  async function handleSellerApply() {
    setSellerError("");
    const missing = REQUIRED_DOCS.filter(d => !docUrls[d.type]);
    if (missing.length) { setSellerError(`Falta subir: ${missing.map(d => d.label).join(", ")}`); return; }
    const missingDates = REQUIRED_DOCS.filter(d => d.needsDate && !docDates[d.type]);
    if (missingDates.length) { setSellerError(`Falta fecha de emisión de: ${missingDates.map(d => d.label).join(", ")}`); return; }
    setSellerSubmitting(true);
    try {
      for (const doc of REQUIRED_DOCS) {
        await sellerDocumentsApi.uploadFromUrl(doc.type, docUrls[doc.type], docDates[doc.type]);
      }
      const { data } = await sellerApplicationsApi.apply(sellerForm);
      setApplication(data);
      capture("seller_application_submitted");
      setShowSellerModal(false);
    } catch (e: any) {
      setSellerError(e?.response?.data?.message ?? "Error al enviar solicitud. Intenta de nuevo.");
    } finally {
      setSellerSubmitting(false);
    }
  }

  if (authLoading || !user) return null;

  const initials = (fullUser?.displayName ?? user.username).slice(0, 2).toUpperCase();
  const memberSince = fullUser?.createdAt
    ? new Date(fullUser.createdAt).toLocaleDateString("es-MX", { month: "long", year: "numeric" })
    : "—";

  const roleLabel: Record<string, string> = {
    BUYER: "Comprador",
    SELLER: "Vendedor",
    ADMIN: "Administrador",
    buyer: "Comprador",
    seller: "Vendedor",
    admin: "Administrador",
  };

  return (
    <div className="min-h-screen bg-[#0F0F14] text-white">
      <Navbar />

      <div className="pt-24 pb-16 mx-auto max-w-5xl px-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/perfil" className="text-zinc-500 hover:text-white transition-colors text-sm">
            ← Perfil
          </Link>
          <h1 className="text-2xl font-black">Ajustes de cuenta</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar */}
          <div className="lg:w-56 shrink-0">
            <div className="rounded-2xl overflow-hidden" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.07)" }}>
              {/* User card */}
              <div className="p-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
                    style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{fullUser?.displayName ?? user.username}</p>
                    <p className="text-[11px] text-zinc-500 truncate">@{user.username}</p>
                  </div>
                </div>
              </div>

              {/* Nav */}
              <nav className="p-2">
                {SECTIONS.map(s => (
                  <button
                    key={s.key}
                    onClick={() => setActiveSection(s.key)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left"
                    style={
                      activeSection === s.key
                        ? { background: "rgba(108,58,232,0.15)", color: "#a78bfa", borderLeft: "3px solid #6C3AE8", paddingLeft: "9px" }
                        : { color: "#71717a", borderLeft: "3px solid transparent", paddingLeft: "9px" }
                    }
                  >
                    <span>{s.icon}</span>
                    <span>{s.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-6">

            {/* ── CUENTA ── */}
            {activeSection === "cuenta" && (
              <>
                <SectionCard title="Información personal">
                  <div className="flex items-center gap-4 mb-6 pb-6 border-b border-white/5">
                    <label className="relative cursor-pointer group shrink-0">
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black overflow-hidden"
                        style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 0 24px rgba(108,58,232,0.4)" }}
                      >
                        {avatarUrl
                          ? <img src={avatarUrl} alt="avatar" width={64} height={64} className="w-full h-full object-cover" />
                          : initials
                        }
                      </div>
                      <div className="absolute inset-0 rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white text-center leading-tight px-1">
                          {avatarUploading ? "Subiendo..." : "Cambiar"}
                        </span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); e.target.value = ""; }}
                        disabled={avatarUploading}
                      />
                    </label>
                    <div>
                      <p className="font-bold">{fullUser?.displayName ?? user.username}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Miembro desde {memberSince}</p>
                      <span
                        className="inline-block mt-2 text-[10px] font-black px-2.5 py-1 rounded-full"
                        style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa" }}
                      >
                        {roleLabel[user.role] ?? user.role}
                      </span>
                      <p className="text-[10px] text-zinc-600 mt-1">Haz clic en la foto para cambiarla</p>
                    </div>
                  </div>

                  {profileError && (
                    <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                      {profileError}
                    </div>
                  )}

                  <Field label="Nombre para mostrar" hint="Tu nombre visible en el marketplace">
                    <Input
                      value={profileForm.displayName}
                      onChange={v => setProfileForm(p => ({ ...p, displayName: v }))}
                      placeholder={user.username}
                    />
                  </Field>

                  <Field label="Nombre de usuario" hint="Solo letras, números y guiones bajos. Único en la plataforma.">
                    <Input
                      value={profileForm.username}
                      onChange={v => setProfileForm(p => ({ ...p, username: v }))}
                    />
                  </Field>

                  <Field label="Correo electrónico">
                    <Input value={user.email} readOnly />
                    <p className="text-[11px] text-zinc-600 mt-1">Para cambiar tu correo, contáctanos en soporte@tcglive.mx</p>
                  </Field>

                  <div className="flex justify-end mt-2">
                    <SaveButton loading={profileLoading} saved={profileSaved} onClick={saveProfile} />
                  </div>
                </SectionCard>

                {/* Account status */}
                <SectionCard title="Estado de cuenta">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between py-3 border-b border-white/5">
                      <div>
                        <p className="text-sm font-semibold">Verificación</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Estado de verificación de identidad</p>
                      </div>
                      <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={
                        fullUser?.isVerified
                          ? { background: "rgba(74,222,128,0.12)", color: "#4ade80" }
                          : { background: "rgba(245,158,11,0.12)", color: "#f59e0b" }
                      }>
                        {fullUser?.isVerified ? "✓ Verificado" : "Pendiente"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-3 border-b border-white/5">
                      <div>
                        <p className="text-sm font-semibold">Reputación</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Calificaciones positivas recibidas</p>
                      </div>
                      <span className="text-sm font-black" style={{ color: "#a78bfa" }}>
                        {fullUser?.reputationScore ?? 0} pts
                      </span>
                    </div>

                    {user.role === "BUYER" && (
                      <div className="flex items-center justify-between py-3">
                        <div>
                          <p className="text-sm font-semibold">Cuenta de vendedor</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {(!application || application === null) && "Solicita vender en TCG Live"}
                            {application?.status === "pending"  && "Tu solicitud está en revisión (1–3 días hábiles)"}
                            {application?.status === "approved" && "Solicitud aprobada"}
                            {application?.status === "rejected" && `Solicitud rechazada${application.reviewNote ? ` — ${application.reviewNote}` : ""}`}
                          </p>
                        </div>
                        {(!application || application === null) && (
                          <button
                            onClick={() => { setShowSellerModal(true); setSellerStep(1); setSellerError(""); }}
                            className="text-xs font-bold px-4 py-2 rounded-xl shrink-0"
                            style={{ background: "rgba(5,150,105,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}
                          >
                            Solicitar →
                          </button>
                        )}
                        {application?.status === "pending" && (
                          <span className="text-xs font-bold px-3 py-1.5 rounded-full shrink-0" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
                            ⏳ En revisión
                          </span>
                        )}
                        {application?.status === "approved" && (
                          <span className="text-xs font-bold px-3 py-1.5 rounded-full shrink-0" style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}>
                            ✓ Aprobada
                          </span>
                        )}
                        {application?.status === "rejected" && (
                          <button
                            onClick={() => { setShowSellerModal(true); setSellerStep(1); setSellerError(""); }}
                            className="text-xs font-bold px-4 py-2 rounded-xl shrink-0"
                            style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}
                          >
                            Volver a solicitar →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </SectionCard>

                {/* Danger zone */}
                <SectionCard title="Zona de peligro">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-red-400">Cerrar sesión en todos los dispositivos</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Invalida todos los tokens activos</p>
                    </div>
                    <button
                      onClick={logout}
                      className="text-xs font-bold px-4 py-2 rounded-xl"
                      style={{ background: "rgba(248,113,113,0.1)", color: "#f87171", border: "1px solid rgba(248,113,113,0.2)" }}
                    >
                      Cerrar sesión
                    </button>
                  </div>
                </SectionCard>
              </>
            )}

            {/* ── SEGURIDAD ── */}
            {activeSection === "seguridad" && (
              <SectionCard title="Cambiar contraseña">
                <div className="max-w-md">
                  {passError && (
                    <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                      {passError}
                    </div>
                  )}

                  <Field label="Contraseña actual">
                    <Input
                      type="password"
                      value={passForm.current}
                      onChange={v => setPassForm(p => ({ ...p, current: v }))}
                      placeholder="Tu contraseña actual"
                    />
                  </Field>

                  <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
                    <Input
                      type="password"
                      value={passForm.next}
                      onChange={v => setPassForm(p => ({ ...p, next: v }))}
                      placeholder="Nueva contraseña"
                    />
                  </Field>

                  <Field label="Confirmar nueva contraseña">
                    <Input
                      type="password"
                      value={passForm.confirm}
                      onChange={v => setPassForm(p => ({ ...p, confirm: v }))}
                      placeholder="Repite la nueva contraseña"
                    />
                  </Field>

                  {passForm.next && passForm.confirm && (
                    <div className="mb-4 flex items-center gap-2 text-xs" style={{
                      color: passForm.next === passForm.confirm ? "#4ade80" : "#f87171"
                    }}>
                      <span>{passForm.next === passForm.confirm ? "✓" : "✗"}</span>
                      <span>{passForm.next === passForm.confirm ? "Las contraseñas coinciden" : "Las contraseñas no coinciden"}</span>
                    </div>
                  )}

                  <div className="flex justify-end mt-2">
                    <SaveButton loading={passLoading} saved={passSaved} onClick={savePassword} />
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/5">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Consejos de seguridad</p>
                  <ul className="space-y-2">
                    {[
                      "Usa una contraseña única que no uses en otras plataformas",
                      "Incluye letras mayúsculas, minúsculas, números y símbolos",
                      "No compartas tu contraseña con nadie",
                    ].map(tip => (
                      <li key={tip} className="flex items-start gap-2 text-xs text-zinc-500">
                        <span className="mt-0.5 text-[#6C3AE8]">›</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Verificación de persona */}
                <div className="mt-8 pt-6 border-t border-white/5">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Verificación de cuenta</p>
                  <div className="flex items-center justify-between py-3 rounded-xl px-4" style={{ background: "#0F0F14", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">✉️</span>
                      <div>
                        <p className="text-sm font-semibold">Correo electrónico</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{user.email}</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}>
                      ✓ Verificado
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-3 rounded-xl px-4 mt-2" style={{ background: "#0F0F14", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">📱</span>
                      <div>
                        <p className="text-sm font-semibold">Número de celular</p>
                        <p className="text-xs text-zinc-500 mt-0.5">Verificación por SMS — próximamente</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "rgba(161,161,170,0.1)", color: "#71717a" }}>
                      Pendiente
                    </span>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── CUENTA DE VENDEDOR ── */}
            {activeSection === "verificacion" && (
              <div className="space-y-6">
                {user.role === "BUYER" && (
                  <SectionCard title="Solicitar cuenta de vendedor">
                    <p className="text-xs text-zinc-400 mb-5">
                      Para vender en TCG Live necesitas verificar tu identidad subiendo los 6 documentos requeridos.
                      El equipo los revisará en 1–3 días hábiles.
                    </p>
                    {(!application || application === null) && (
                      <button
                        onClick={() => { setShowSellerModal(true); setSellerStep(1); setSellerError(""); }}
                        className="w-full py-3.5 rounded-xl font-black text-white text-sm"
                        style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
                      >
                        Iniciar verificación → Solicitar cuenta de vendedor
                      </button>
                    )}
                    {application?.status === "pending" && (
                      <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                        <span className="text-2xl">⏳</span>
                        <div>
                          <p className="font-bold text-sm">Solicitud en revisión</p>
                          <p className="text-xs text-zinc-500 mt-0.5">Te notificaremos cuando sea revisada.</p>
                        </div>
                      </div>
                    )}
                    {application?.status === "approved" && (
                      <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)" }}>
                        <span className="text-2xl">✅</span>
                        <p className="font-bold text-sm">Solicitud aprobada — ya eres vendedor</p>
                      </div>
                    )}
                    {application?.status === "rejected" && (
                      <>
                        {application.reviewNote && (
                          <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                            <p className="text-xs font-bold text-red-400 mb-1">Motivo del rechazo</p>
                            <p className="text-sm text-zinc-300">{application.reviewNote}</p>
                          </div>
                        )}
                        <button
                          onClick={() => { setShowSellerModal(true); setSellerStep(1); setSellerError(""); }}
                          className="w-full py-3.5 rounded-xl font-black text-white text-sm"
                          style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}
                        >
                          Volver a solicitar →
                        </button>
                      </>
                    )}
                  </SectionCard>
                )}

                {user.role === "SELLER" && (
                  <SectionCard title="Mis documentos de verificación">
                    <p className="text-xs text-zinc-400 mb-5">
                      Algunos documentos tienen fecha de vigencia. Vuelve a subirlos antes de que expiren para mantener tu cuenta activa.
                    </p>
                    <div className="space-y-3">
                      {REQUIRED_DOCS.map(doc => {
                        const existing = myDocs?.find(d => d.documentType === doc.type);
                        const isExpired  = (existing as any)?.isExpired === true;
                        const status     = existing?.status;
                        const needsReupload = !existing || status === "rejected" || isExpired;

                        const statusColor = status === "approved" && !isExpired
                          ? { bg: "rgba(74,222,128,0.1)", color: "#4ade80", label: "✓ Aprobado" }
                          : status === "pending"
                          ? { bg: "rgba(245,158,11,0.1)", color: "#f59e0b", label: "⏳ En revisión" }
                          : isExpired
                          ? { bg: "rgba(248,113,113,0.1)", color: "#f87171", label: "⚠ Vencido" }
                          : status === "rejected"
                          ? { bg: "rgba(248,113,113,0.1)", color: "#f87171", label: "✗ Rechazado" }
                          : { bg: "rgba(255,255,255,0.05)", color: "#71717a", label: "Sin subir" };

                        return (
                          <div key={doc.type} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${needsReupload ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.07)"}` }}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold">{doc.label}</p>
                                <p className="text-[11px] text-zinc-500 mt-0.5">{doc.hint}</p>
                              </div>
                              <span className="text-[11px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: statusColor.bg, color: statusColor.color }}>
                                {statusColor.label}
                              </span>
                            </div>

                            {existing?.rejectionNote && (
                              <p className="text-xs text-red-400 mb-2">Motivo: {existing.rejectionNote}</p>
                            )}

                            {needsReupload && (
                              <div className="mt-2 space-y-2">
                                <input
                                  type="file" accept=".jpg,.jpeg,.png,.pdf"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(doc.type, f, true); }}
                                  className="w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-violet-600/20 file:text-violet-300 hover:file:bg-violet-600/30"
                                />
                                {doc.needsDate && (
                                  <div>
                                    <label className="text-[11px] text-zinc-500 block mb-1">Fecha de emisión</label>
                                    <input type="date"
                                      value={reuploadDates[doc.type] ?? ""}
                                      onChange={e => setReuploadDates(p => ({ ...p, [doc.type]: e.target.value }))}
                                      className="bg-[#0F0F14] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#6C3AE8]/60"
                                    />
                                  </div>
                                )}
                                {reuploadError[doc.type] && (
                                  <p className="text-xs text-red-400">{reuploadError[doc.type]}</p>
                                )}
                                {reuploadUrls[doc.type] && !reuploadDone[doc.type] && (
                                  <button
                                    onClick={() => handleReuploadSubmit(doc.type)}
                                    disabled={reuploadBusy[doc.type]}
                                    className="text-xs font-bold px-4 py-2 rounded-xl text-white disabled:opacity-60"
                                    style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                                  >
                                    {reuploadBusy[doc.type] ? "Guardando..." : "Enviar documento →"}
                                  </button>
                                )}
                                {reuploadDone[doc.type] && (
                                  <p className="text-xs text-green-400 font-bold">✓ Enviado — pendiente de revisión</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                )}
              </div>
            )}

            {/* ── DIRECCIÓN ── */}
            {activeSection === "direccion" && (
              <SectionCard title="Dirección de envío">
                <p className="text-xs text-zinc-500 mb-5">Esta dirección se usa para recibir tus compras. Puedes cambiarla en cualquier momento.</p>

                {addrError && (
                  <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                    {addrError}
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Field label="Calle y número">
                      <Input
                        value={addrForm.street}
                        onChange={v => setAddrForm(p => ({ ...p, street: v }))}
                        placeholder="Ej: Av. Insurgentes Sur 1234"
                      />
                    </Field>
                  </div>

                  <Field label="Colonia / Fraccionamiento">
                    <Input
                      value={addrForm.colonia}
                      onChange={v => setAddrForm(p => ({ ...p, colonia: v }))}
                      placeholder="Ej: Del Valle"
                    />
                  </Field>

                  <Field label="Código postal">
                    <Input
                      value={addrForm.zipCode}
                      onChange={v => setAddrForm(p => ({ ...p, zipCode: v }))}
                      placeholder="Ej: 03100"
                    />
                  </Field>

                  <Field label="Ciudad / Municipio">
                    <Input
                      value={addrForm.city}
                      onChange={v => setAddrForm(p => ({ ...p, city: v }))}
                      placeholder="Ej: Benito Juárez"
                    />
                  </Field>

                  <Field label="Estado">
                    <select
                      value={addrForm.state}
                      onChange={e => setAddrForm(p => ({ ...p, state: e.target.value }))}
                      className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#6C3AE8]/60"
                    >
                      <option value="">Selecciona tu estado</option>
                      {ESTADOS_MX.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>

                {/* Preview */}
                {(addrForm.street || addrForm.colonia || addrForm.city) && (
                  <div className="mt-4 p-4 rounded-xl" style={{ background: "rgba(108,58,232,0.06)", border: "1px solid rgba(108,58,232,0.15)" }}>
                    <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1">Vista previa</p>
                    <p className="text-sm text-zinc-300">
                      {[addrForm.street, addrForm.colonia, addrForm.city, addrForm.state, addrForm.zipCode].filter(Boolean).join(", ")}
                    </p>
                  </div>
                )}

                <div className="flex justify-end mt-4">
                  <SaveButton loading={addrLoading} saved={addrSaved} onClick={saveAddress} />
                </div>
              </SectionCard>
            )}

            {/* ── FORMA DE PAGO ── */}
            {activeSection === "pago" && (
              <SectionCard title="Forma de pago">
                <p className="text-xs text-zinc-500 mb-5">
                  Los pagos en TCG Subastas se procesan con Mercado Pago — no necesitas guardar una tarjeta aquí.
                  Al ganar una subasta o comprar una carta, recibirás un enlace de pago donde puedes usar
                  tarjeta de crédito/débito, transferencia o saldo de Mercado Pago.
                </p>
                <div
                  className="rounded-xl p-4 flex items-center gap-4"
                  style={{ background: "rgba(0,174,240,0.06)", border: "1px solid rgba(0,174,240,0.2)" }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                    style={{ background: "rgba(0,174,240,0.12)" }}
                  >
                    💳
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Mercado Pago</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Pago seguro al momento de confirmar tu compra</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {["Visa", "Mastercard", "OXXO", "SPEI", "Saldo MP"].map(m => (
                        <span
                          key={m}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded"
                          style={{ background: "rgba(255,255,255,0.07)", color: "#a1a1aa" }}
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-zinc-600 mt-4">
                  Para pujar en subastas primero necesitas tener tu dirección de envío guardada.
                  Esto garantiza que podamos enviarte la carta si ganas.
                </p>

                {/* ── Datos para cobro ── */}
                <div className="mt-6 pt-6 border-t border-white/5">
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-1">Datos para cobro (vendedores)</p>
                  <p className="text-[11px] text-zinc-600 mb-5">
                    Necesario para recibir el pago de tus ventas. El dinero se libera automáticamente cuando el comprador recibe su paquete.
                  </p>

                  {payoutError && (
                    <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                      {payoutError}
                    </div>
                  )}

                  <Field label="CLABE interbancaria" hint="18 dígitos — para recibir transferencia bancaria directa">
                    <Input
                      value={payoutForm.clabe}
                      onChange={v => setPayoutForm(p => ({ ...p, clabe: v }))}
                      placeholder="000000000000000000"
                    />
                  </Field>

                  <Field label="Correo de Mercado Pago" hint="Alternativa: correo asociado a tu cuenta de Mercado Pago">
                    <Input
                      type="email"
                      value={payoutForm.mpPayoutEmail}
                      onChange={v => setPayoutForm(p => ({ ...p, mpPayoutEmail: v }))}
                      placeholder="tucorreo@ejemplo.com"
                    />
                  </Field>

                  <div className="flex justify-end mt-2">
                    <SaveButton loading={payoutLoading} saved={payoutSaved} onClick={savePayout} />
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── NOTIFICACIONES ── */}
            {activeSection === "notificaciones" && (
              <SectionCard title="Preferencias de notificaciones">
                <p className="text-xs text-zinc-500 mb-5">Elige qué notificaciones deseas recibir por correo electrónico.</p>

                <div className="space-y-1">
                  {([
                    { key: "outbid" as const,      label: "Me superaron una puja",    desc: "Cuando alguien puja más que tú en una subasta activa" },
                    { key: "orderUpdate" as const, label: "Actualizaciones de órdenes", desc: "Confirmación de compra, envío y entrega" },
                    { key: "newMessage" as const,  label: "Mensajes nuevos",           desc: "Cuando recibes un mensaje de un vendedor o comprador" },
                    { key: "promotions" as const,  label: "Promociones y novedades",   desc: "Subastas especiales, nuevas cartas y ofertas exclusivas" },
                  ]).map(({ key, label, desc }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4 py-4 border-b border-white/5 last:border-0"
                    >
                      <div>
                        <p className="text-sm font-semibold">{label}</p>
                        <p className="text-xs text-zinc-500 mt-0.5">{desc}</p>
                      </div>
                      <button
                        onClick={() => saveNotifs({ ...notifs, [key]: !notifs[key] })}
                        className="relative w-11 h-6 rounded-full transition-all shrink-0"
                        style={{ background: notifs[key] ? "#6C3AE8" : "rgba(255,255,255,0.1)" }}
                      >
                        <span
                          className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
                          style={{ left: notifs[key] ? "calc(100% - 22px)" : "2px" }}
                        />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-5 p-4 rounded-xl" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                  <p className="text-xs text-amber-400/80">
                    Las notificaciones por email se enviarán a <strong>{user.email}</strong>. Las notificaciones críticas de seguridad siempre se envían independientemente de estas preferencias.
                  </p>
                </div>
              </SectionCard>
            )}

          </div>
        </div>
      </div>

      {/* ── MODAL SOLICITUD VENDEDOR ── */}
      {showSellerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div role="dialog" aria-modal="true" className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6" style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}>
            <button onClick={() => setShowSellerModal(false)} aria-label="Cerrar" className="absolute top-4 right-4 text-zinc-500 hover:text-white text-xl">✕</button>

            <h2 className="text-xl font-black mb-1">Solicitar cuenta de vendedor</h2>
            <p className="text-xs text-zinc-500 mb-6">Paso {sellerStep} de 2 — {sellerStep === 1 ? "Datos personales" : "Documentos requeridos"}</p>

            {sellerError && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm text-red-400" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                {sellerError}
              </div>
            )}

            {sellerStep === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Nombre completo</label>
                  <input value={sellerForm.fullName} onChange={e => setSellerForm(p => ({ ...p, fullName: e.target.value }))}
                    placeholder="Como aparece en tu INE"
                    className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Estado</label>
                  <select value={sellerForm.state} onChange={e => setSellerForm(p => ({ ...p, state: e.target.value }))}
                    className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#6C3AE8]/60">
                    <option value="">Selecciona tu estado</option>
                    {ESTADOS_MX.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-400 mb-1.5">¿Qué vendes y cuál es tu experiencia?</label>
                  <textarea value={sellerForm.description} onChange={e => setSellerForm(p => ({ ...p, description: e.target.value }))}
                    rows={4} placeholder="Ej: Vendo cartas de Pokémon y MTG, llevo 3 años coleccionando..." maxLength={500}
                    className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 resize-none" />
                  <p className="text-[11px] text-zinc-600 mt-1 text-right">{sellerForm.description.length}/500</p>
                </div>
                <button
                  onClick={() => {
                    if (!sellerForm.fullName || !sellerForm.state || sellerForm.description.length < 20) {
                      setSellerError("Completa todos los campos (descripción mínimo 20 caracteres).");
                      return;
                    }
                    setSellerError(""); setSellerStep(2);
                  }}
                  className="w-full py-3.5 rounded-xl font-black text-white mt-2"
                  style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
                >
                  Continuar →
                </button>
              </div>
            )}

            {sellerStep === 2 && (
              <div className="flex flex-col gap-3">
                {REQUIRED_DOCS.map(doc => {
                  const uploaded  = !!docUrls[doc.type];
                  const uploading = !!docUploading[doc.type];
                  return (
                    <div key={doc.type} className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${uploaded ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.07)"}` }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-bold">{doc.label}</p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">{doc.hint}</p>
                        </div>
                        {uploaded  && <span className="text-[11px] font-black text-green-400 shrink-0">✓ Listo</span>}
                        {uploading && <span className="text-[11px] text-zinc-400 shrink-0 animate-pulse">Subiendo...</span>}
                      </div>
                      <input type="file" accept=".jpg,.jpeg,.png,.pdf"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(doc.type, f, false); }}
                        className="w-full text-xs text-zinc-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-violet-600/20 file:text-violet-300 hover:file:bg-violet-600/30 cursor-pointer" />
                      {doc.needsDate && (
                        <div className="mt-2">
                          <label className="text-[11px] text-zinc-500 block mb-1">Fecha de emisión</label>
                          <input type="date" value={docDates[doc.type] ?? ""} onChange={e => setDocDates(p => ({ ...p, [doc.type]: e.target.value }))}
                            className="bg-[#0F0F14] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#6C3AE8]/60" />
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex gap-3 mt-2">
                  <button onClick={() => setSellerStep(1)} className="flex-1 py-3 rounded-xl font-bold text-zinc-400 text-sm" style={{ background: "rgba(255,255,255,0.05)" }}>
                    ← Atrás
                  </button>
                  <button onClick={handleSellerApply} disabled={sellerSubmitting}
                    className="flex-1 py-3 rounded-xl font-black text-white text-sm disabled:opacity-60"
                    style={{ background: "linear-gradient(135deg, #059669, #10b981)" }}>
                    {sellerSubmitting ? "Enviando..." : "Enviar solicitud"}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-600 text-center">Tu solicitud será revisada en 1–3 días hábiles</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
