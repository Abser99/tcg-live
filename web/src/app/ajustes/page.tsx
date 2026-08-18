"use client";

import { useState, useEffect, useRef, useId, Children, isValidElement, cloneElement } from "react";
import type { ReactElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import { usersApi, sellerApplicationsApi, sellerDocumentsApi, geoApi, paymentMethodsApi, type ApiUser, type SellerApplication, type SellerDocumentRecord, type ApiPaymentMethod } from "@/lib/api";
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

// Copomex sometimes returns long official state names — normalize + alias to match our select options
const ESTADO_ALIASES: Record<string, string> = {
  "distrito federal": "Ciudad de México",
  "estado de mexico": "México",
  "coahuila de zaragoza": "Coahuila",
  "veracruz de ignacio de la llave": "Veracruz",
  "michoacan de ocampo": "Michoacán",
};

function normalizeEs(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function matchEstado(raw: string): string {
  const norm = normalizeEs(raw);
  const aliased = ESTADO_ALIASES[norm];
  if (aliased) return aliased;
  const found = ESTADOS_MX.find(e => normalizeEs(e) === norm);
  return found ?? raw;
}

type Section = "cuenta" | "seguridad" | "direccion" | "pago" | "notificaciones" | "verificacion";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "cuenta",         label: "Información personal", icon: "👤" },
  { key: "verificacion",   label: "Cuenta de vendedor",    icon: "🏪" },
  { key: "seguridad",      label: "Contraseña",            icon: "🔒" },
  { key: "direccion",      label: "Dirección de envío",    icon: "📦" },
  { key: "pago",           label: "Forma de pago",         icon: "💳" },
  { key: "notificaciones", label: "Notificaciones",         icon: "🔔" },
];

function SectionCard({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
      <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-elevated)" }}>
        {icon && (
          <span className="w-9 h-9 flex items-center justify-center rounded-xl text-lg shrink-0" style={{ background: "rgba(37,99,235,0.12)" }}>
            {icon}
          </span>
        )}
        <h2 className="text-base font-black" style={{ color: "var(--text-primary)" }}>{title}</h2>
      </div>
      <div className="p-6">
        {children}
      </div>
    </div>
  );
}

// Elements that can meaningfully receive a form `id` + `aria-describedby` pair.
function isLabelableChild(el: ReactElement): boolean {
  return el.type === Input || el.type === "select" || el.type === "textarea" || el.type === "input";
}

function Field({ label, hint, id: idProp, children }: { label: string; hint?: string; id?: string; children: React.ReactNode }) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = hint ? `${id}-hint` : undefined;

  let injected = false;
  const content = Children.map(children, (child) => {
    if (!injected && isValidElement(child) && isLabelableChild(child)) {
      injected = true;
      const childProps = child.props as Record<string, unknown>;
      return cloneElement(child as ReactElement<any>, {
        id: (childProps.id as string | undefined) ?? id,
        "aria-describedby": hintId ?? (childProps["aria-describedby"] as string | undefined),
      });
    }
    return child;
  });

  return (
    <div className="mb-4">
      <label htmlFor={id} className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>{label}</label>
      {content}
      {hint && <p id={hintId} className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text", readOnly = false, id, "aria-describedby": ariaDescribedBy }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; type?: string; readOnly?: boolean; id?: string; "aria-describedby"?: string;
}) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";

  const inputEl = (
    <input
      id={id}
      type={isPassword ? (show ? "text" : "password") : type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      aria-describedby={ariaDescribedBy}
      className={`w-full rounded-xl px-4 py-3 text-sm placeholder:text-zinc-500 focus:ring-2 focus:ring-[#2563EB]/40 transition-all ${isPassword ? "pr-11" : ""}`}
      style={{
        background: "var(--bg-input)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
        ...(readOnly ? { opacity: 0.5, cursor: "not-allowed" } : {}),
      }}
    />
  );

  if (!isPassword) return inputEl;

  return (
    <div className="relative">
      {inputEl}
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
        style={{ color: "var(--text-muted)" }}
      >
        {show ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}

function SaveButton({ loading, saved, onClick }: { loading: boolean; saved: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full py-3 rounded-xl text-sm font-black text-white disabled:opacity-60"
      style={{
        background: saved
          ? "linear-gradient(135deg, #059669, #10b981)"
          : "linear-gradient(135deg, #2563EB, #3B82F6)",
        boxShadow: saved
          ? "0 4px 16px rgba(5,150,105,0.35)"
          : "0 4px 16px rgba(37,99,235,0.35)",
        transition: "all 0.3s ease",
        transform: saved ? "scale(1.01)" : "scale(1)",
      }}
    >
      {loading ? "Guardando..." : saved ? "✓ Cambios guardados" : "Guardar cambios"}
    </button>
  );
}

export default function AjustesPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const { capture } = useAnalytics();
  const [activeSection, setActiveSection] = useState<Section>("cuenta");

  // Deep-link to a section via ?section=pago (e.g. from the live wallet shortcut)
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("section");
    if (s && SECTIONS.some(x => x.key === s)) setActiveSection(s as Section);
  }, []);

  // Saved cards — the main wallet, synced with the live wallet popup
  const [savedCards, setSavedCards] = useState<ApiPaymentMethod[]>([]);
  const loadCards = () => { paymentMethodsApi.my().then(r => setSavedCards(r.data)).catch(() => {}); };
  useEffect(() => { loadCards(); }, []);
  async function removeCard(id: string) {
    setSavedCards(prev => prev.filter(c => c.id !== id));
    try { await paymentMethodsApi.remove(id); } catch { loadCards(); }
  }

  const [fullUser, setFullUser]   = useState<ApiUser | null>(null);
  const [application, setApplication] = useState<SellerApplication | null | undefined>(undefined);
  const [myDocs, setMyDocs]       = useState<SellerDocumentRecord[] | null>(null);

  const [showSellerModal, setShowSellerModal] = useState(false);
  const sellerModalRef = useRef<HTMLDivElement>(null);
  const [sellerStep, setSellerStep]           = useState<1 | 2>(1);
  const [sellerForm, setSellerForm]           = useState({ fullName: "", state: "", description: "" });
  const [docUrls, setDocUrls]                 = useState<Record<string, string>>({});
  const [docDates, setDocDates]               = useState<Record<string, string>>({});
  const [docUploading, setDocUploading]       = useState<Record<string, boolean>>({});
  const [sellerSubmitting, setSellerSubmitting] = useState(false);
  const [sellerError, setSellerError]         = useState("");

  const [reuploadUrls, setReuploadUrls]     = useState<Record<string, string>>({});
  const [reuploadDates, setReuploadDates]   = useState<Record<string, string>>({});
  const [reuploadBusy, setReuploadBusy]     = useState<Record<string, boolean>>({});
  const [reuploadDone, setReuploadDone]     = useState<Record<string, boolean>>({});
  const [reuploadError, setReuploadError]   = useState<Record<string, string>>({});

  const [profileForm, setProfileForm] = useState({ username: "", displayName: "" });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [passForm, setPassForm] = useState({ current: "", next: "", confirm: "" });
  const [passLoading, setPassLoading] = useState(false);
  const [passSaved, setPassSaved] = useState(false);
  const [passError, setPassError] = useState("");

  const [addrForm, setAddrForm] = useState({ street: "", colonia: "", city: "", state: "", zipCode: "" });
  const [addrLoading, setAddrLoading] = useState(false);
  const [addrSaved, setAddrSaved] = useState(false);
  const [addrError, setAddrError] = useState("");
  const [zipColonias, setZipColonias] = useState<string[]>([]);
  const [zipLookupLoading, setZipLookupLoading] = useState(false);
  const [zipLookupDone, setZipLookupDone] = useState(false);
  const [zipLookupError, setZipLookupError] = useState(false);

  useEffect(() => {
    const cp = addrForm.zipCode;
    if (!/^\d{5}$/.test(cp)) {
      setZipColonias([]);
      setZipLookupDone(false);
      setZipLookupError(false);
      return;
    }
    let cancelled = false;
    setZipLookupLoading(true);
    setZipLookupDone(false);
    setZipLookupError(false);
    const timer = setTimeout(async () => {
      try {
        const res = await geoApi.lookupZip(cp);
        if (cancelled) return;
        const data = res.data;
        if (data) {
          setZipColonias(data.colonias);
          setAddrForm(f => ({
            ...f,
            city: data.municipio || data.ciudad || f.city,
            state: data.estado ? matchEstado(data.estado) : f.state,
            colonia: data.colonias.length === 1 ? data.colonias[0] : f.colonia,
          }));
          setZipLookupDone(true);
        } else {
          setZipColonias([]);
        }
      } catch {
        if (cancelled) return;
        setZipColonias([]);
        setZipLookupError(true);
      } finally {
        if (!cancelled) setZipLookupLoading(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [addrForm.zipCode]);

  const [payoutForm, setPayoutForm] = useState({ clabe: "", mpPayoutEmail: "" });
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutSaved, setPayoutSaved] = useState(false);
  const [payoutError, setPayoutError] = useState("");

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
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sellerModalRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
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

  const inputSelectStyle = {
    background: "var(--bg-input)",
    border: "1px solid var(--border)",
    color: "var(--text-primary)",
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <Navbar />

      <main id="main" className="pt-24 pb-16 mx-auto max-w-5xl px-6">

        {/* Page hero header */}
        <div className="relative text-center mb-10 pb-8">
          <Link
            href="/perfil"
            className="absolute left-0 top-1 text-sm font-medium transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            ← Perfil
          </Link>

          <div className="inline-flex flex-col items-center gap-4">
            <div className="relative">
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                  boxShadow: "0 0 0 4px rgba(37,99,235,0.15), 0 0 40px rgba(37,99,235,0.35)",
                }}
              >
                {avatarUrl
                  ? <img src={avatarUrl} alt={`Foto de perfil de ${fullUser?.displayName ?? user.username}`} width={80} height={80} className="w-full h-full object-cover" />
                  : initials
                }
              </div>
              {avatarUploading && (
                <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl font-black" style={{ color: "var(--text-primary)" }}>
                {fullUser?.displayName ?? user.username}
              </h1>
              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                Miembro desde {memberSince}
              </p>
              <span
                className="inline-block mt-2 text-[10px] font-black px-3 py-1 rounded-full"
                style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)" }}
              >
                {roleLabel[user.role] ?? user.role}
              </span>
            </div>
          </div>

          {/* Gradient divider */}
          <div
            className="absolute bottom-0 left-0 right-0 h-px"
            style={{ background: "linear-gradient(to right, transparent, var(--border-brand), transparent)" }}
          />
        </div>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* Sidebar */}
          <div className="lg:w-60 shrink-0">
            <div className="rounded-2xl overflow-hidden sticky top-24" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
              {/* User card */}
              <div className="p-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black shrink-0 overflow-hidden"
                    style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
                  >
                    {avatarUrl
                      ? <img src={avatarUrl} alt={`Foto de perfil de ${fullUser?.displayName ?? user.username}`} width={40} height={40} className="w-full h-full object-cover" />
                      : initials
                    }
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                      {fullUser?.displayName ?? user.username}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>@{user.username}</p>
                  </div>
                </div>
              </div>

              {/* Nav */}
              <nav className="p-2">
                {SECTIONS.map(s => {
                  const active = activeSection === s.key;
                  return (
                    <button
                      key={s.key}
                      onClick={() => setActiveSection(s.key)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all text-left mb-0.5"
                      style={
                        active
                          ? {
                              background: "rgba(37,99,235,0.12)",
                              color: "var(--accent-text)",
                              boxShadow: "inset 3px 0 0 #2563EB",
                            }
                          : {
                              color: "var(--text-muted)",
                              background: "transparent",
                            }
                      }
                    >
                      <span className="text-base">{s.icon}</span>
                      <span>{s.label}</span>
                      {active && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#2563EB" }} />
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* ── CUENTA ── */}
            {activeSection === "cuenta" && (
              <>
                <SectionCard title="Información personal" icon="👤">
                  {/* Avatar + identity row */}
                  <div
                    className="flex items-center gap-5 mb-6 pb-6"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <label className="relative cursor-pointer group shrink-0">
                      <div
                        className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black overflow-hidden"
                        style={{
                          background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                          boxShadow: "0 0 32px rgba(37,99,235,0.35)",
                        }}
                      >
                        {avatarUrl
                          ? <img src={avatarUrl} alt={`Foto de perfil de ${fullUser?.displayName ?? user.username}`} width={80} height={80} className="w-full h-full object-cover" />
                          : initials
                        }
                      </div>
                      <div className="absolute inset-0 rounded-2xl bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white text-center leading-tight px-1">
                          {avatarUploading ? "Subiendo..." : "Cambiar foto"}
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
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-base" style={{ color: "var(--text-primary)" }}>
                        {fullUser?.displayName ?? user.username}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        @{user.username} · Miembro desde {memberSince}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span
                          className="inline-block text-[10px] font-black px-2.5 py-1 rounded-full"
                          style={{ background: "rgba(37,99,235,0.15)", color: "var(--accent-text)" }}
                        >
                          {roleLabel[user.role] ?? user.role}
                        </span>
                        {fullUser?.isVerified && (
                          <span
                            className="inline-block text-[10px] font-black px-2.5 py-1 rounded-full"
                            style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}
                          >
                            ✓ Verificado
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] mt-2" style={{ color: "var(--text-muted)" }}>
                        Haz clic en la foto para cambiarla
                      </p>
                    </div>
                  </div>

                  {profileError && (
                    <div className="mb-4 px-4 py-3 rounded-xl text-sm text-[var(--error-text)]" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
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

                  <Field label="Correo electrónico" id="ajustes-email-readonly">
                    <Input value={user.email} readOnly aria-describedby="ajustes-email-readonly-hint" />
                    <p id="ajustes-email-readonly-hint" className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                      Para cambiar tu correo, contáctanos en tcgsubastas@gmail.com
                    </p>
                  </Field>

                  <div className="mt-4">
                    <SaveButton loading={profileLoading} saved={profileSaved} onClick={saveProfile} />
                  </div>
                </SectionCard>

                {/* Account status */}
                <SectionCard title="Estado de cuenta" icon="⭐">
                  <div className="space-y-0">
                    <div className="flex items-center justify-between py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Verificación</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Estado de verificación de identidad</p>
                      </div>
                      <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={
                        fullUser?.isVerified
                          ? { background: "rgba(74,222,128,0.12)", color: "#4ade80" }
                          : { background: "rgba(245,158,11,0.12)", color: "#f59e0b" }
                      }>
                        {fullUser?.isVerified ? "✓ Verificado" : "Pendiente"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-4" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Reputación</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Calificaciones positivas recibidas</p>
                      </div>
                      <span className="text-sm font-black" style={{ color: "var(--accent-text)" }}>
                        {fullUser?.reputationScore ?? 0} pts
                      </span>
                    </div>

                    {user.role === "BUYER" && (
                      <div className="flex items-center justify-between py-4">
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Cuenta de vendedor</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
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
                            En revisión
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
                            style={{ background: "rgba(248,113,113,0.1)", color: "var(--error-text)", border: "1px solid rgba(248,113,113,0.2)" }}
                          >
                            Volver a solicitar →
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </SectionCard>

                {/* Danger zone */}
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ background: "rgba(248,113,113,0.04)", border: "1px solid rgba(248,113,113,0.2)", boxShadow: "var(--card-shadow)" }}
                >
                  <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(248,113,113,0.12)", background: "rgba(248,113,113,0.06)" }}>
                    <span className="w-9 h-9 flex items-center justify-center rounded-xl text-lg shrink-0" style={{ background: "rgba(248,113,113,0.12)" }}>
                      ⚠️
                    </span>
                    <h2 className="text-base font-black text-[var(--error-text)]">Zona de peligro</h2>
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-[var(--error-text)]">Cerrar sesión en todos los dispositivos</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Invalida todos los tokens activos de seguridad</p>
                      </div>
                      <button
                        onClick={logout}
                        className="text-xs font-bold px-5 py-2.5 rounded-xl shrink-0 transition-all"
                        style={{ background: "rgba(248,113,113,0.12)", color: "var(--error-text)", border: "1px solid rgba(248,113,113,0.25)" }}
                      >
                        Cerrar sesión
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── SEGURIDAD ── */}
            {activeSection === "seguridad" && (
              <SectionCard title="Cambiar contraseña" icon="🔒">
                <div className="max-w-md">
                  {passError && (
                    <div className="mb-4 px-4 py-3 rounded-xl text-sm text-[var(--error-text)]" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
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
                      color: passForm.next === passForm.confirm ? "#4ade80" : "var(--error-text)"
                    }}>
                      <span>{passForm.next === passForm.confirm ? "✓" : "✗"}</span>
                      <span>{passForm.next === passForm.confirm ? "Las contraseñas coinciden" : "Las contraseñas no coinciden"}</span>
                    </div>
                  )}

                  <div className="mt-4">
                    <SaveButton loading={passLoading} saved={passSaved} onClick={savePassword} />
                  </div>
                </div>

                <div className="mt-8 pt-6" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
                    Consejos de seguridad
                  </p>
                  <ul className="space-y-2">
                    {[
                      "Usa una contraseña única que no uses en otras plataformas",
                      "Incluye letras mayúsculas, minúsculas, números y símbolos",
                      "No compartas tu contraseña con nadie",
                    ].map(tip => (
                      <li key={tip} className="flex items-start gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                        <span className="mt-0.5" style={{ color: "var(--brand)" }}>›</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-8 pt-6" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
                    Verificación de cuenta
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between py-3 rounded-xl px-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">✉️</span>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Correo electrónico</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{user.email}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}>
                        ✓ Verificado
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-3 rounded-xl px-4" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
                      <div className="flex items-center gap-3">
                        <span className="text-xl">📱</span>
                        <div>
                          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Número de celular</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Verificación por SMS — próximamente</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
                        Pendiente
                      </span>
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── CUENTA DE VENDEDOR ── */}
            {activeSection === "verificacion" && (
              <div className="space-y-5">
                {user.role === "BUYER" && (
                  <SectionCard title="Solicitar cuenta de vendedor" icon="🏪">
                    <p className="text-xs mb-5" style={{ color: "var(--text-secondary)" }}>
                      Para vender en TCG Live necesitas verificar tu identidad subiendo los 6 documentos requeridos.
                      El equipo los revisará en 1–3 días hábiles.
                    </p>
                    {(!application || application === null) && (
                      <button
                        onClick={() => { setShowSellerModal(true); setSellerStep(1); setSellerError(""); }}
                        className="w-full py-3.5 rounded-xl font-black text-white text-sm transition-all"
                        style={{ background: "linear-gradient(135deg, #059669, #10b981)", boxShadow: "0 4px 20px rgba(5,150,105,0.35)" }}
                      >
                        Iniciar verificación → Solicitar cuenta de vendedor
                      </button>
                    )}
                    {application?.status === "pending" && (
                      <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
                        <span className="text-2xl">⏳</span>
                        <div>
                          <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Solicitud en revisión</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>Te notificaremos cuando sea revisada.</p>
                        </div>
                      </div>
                    )}
                    {application?.status === "approved" && (
                      <div className="rounded-xl p-4 flex items-center gap-3" style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)" }}>
                        <span className="text-2xl">✅</span>
                        <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Solicitud aprobada — ya eres vendedor</p>
                      </div>
                    )}
                    {application?.status === "rejected" && (
                      <>
                        {application.reviewNote && (
                          <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                            <p className="text-xs font-bold text-[var(--error-text)] mb-1">Motivo del rechazo</p>
                            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{application.reviewNote}</p>
                          </div>
                        )}
                        <button
                          onClick={() => { setShowSellerModal(true); setSellerStep(1); setSellerError(""); }}
                          className="w-full py-3.5 rounded-xl font-black text-white text-sm"
                          style={{ background: "linear-gradient(135deg, #059669, #10b981)", boxShadow: "0 4px 20px rgba(5,150,105,0.35)" }}
                        >
                          Volver a solicitar →
                        </button>
                      </>
                    )}
                  </SectionCard>
                )}

                {user.role === "SELLER" && (
                  <SectionCard title="Mis documentos de verificación" icon="📋">
                    <p className="text-xs mb-5" style={{ color: "var(--text-secondary)" }}>
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
                          ? { bg: "rgba(245,158,11,0.1)", color: "#f59e0b", label: "En revisión" }
                          : isExpired
                          ? { bg: "rgba(248,113,113,0.1)", color: "var(--error-text)", label: "Vencido" }
                          : status === "rejected"
                          ? { bg: "rgba(248,113,113,0.1)", color: "var(--error-text)", label: "Rechazado" }
                          : { bg: "var(--bg-hover)", color: "var(--text-muted)", label: "Sin subir" };

                        return (
                          <div
                            key={doc.type}
                            className="rounded-xl p-4"
                            style={{
                              background: needsReupload ? "rgba(248,113,113,0.04)" : "var(--bg-elevated)",
                              border: `1px solid ${needsReupload ? "rgba(248,113,113,0.2)" : "var(--border)"}`,
                            }}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{doc.label}</p>
                                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{doc.hint}</p>
                              </div>
                              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ background: statusColor.bg, color: statusColor.color }}>
                                {statusColor.label}
                              </span>
                            </div>

                            {existing?.rejectionNote && (
                              <p className="text-xs text-[var(--error-text)] mb-2">Motivo: {existing.rejectionNote}</p>
                            )}

                            {needsReupload && (
                              <div className="mt-2 space-y-2">
                                <input
                                  type="file" accept=".jpg,.jpeg,.png,.pdf"
                                  onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(doc.type, f, true); }}
                                  className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-600/20 file:text-blue-300 hover:file:bg-blue-600/30"
                                  style={{ color: "var(--text-secondary)" }}
                                />
                                {doc.needsDate && (
                                  <div>
                                    <label htmlFor={`reupload-date-${doc.type}`} className="text-[11px] block mb-1" style={{ color: "var(--text-muted)" }}>Fecha de emisión</label>
                                    <input type="date"
                                      id={`reupload-date-${doc.type}`}
                                      value={reuploadDates[doc.type] ?? ""}
                                      onChange={e => setReuploadDates(p => ({ ...p, [doc.type]: e.target.value }))}
                                      className="rounded-lg px-3 py-1.5 text-xs focus:border-[#2563EB]/60"
                                      style={inputSelectStyle}
                                    />
                                  </div>
                                )}
                                {reuploadError[doc.type] && (
                                  <p className="text-xs text-[var(--error-text)]">{reuploadError[doc.type]}</p>
                                )}
                                {reuploadUrls[doc.type] && !reuploadDone[doc.type] && (
                                  <button
                                    onClick={() => handleReuploadSubmit(doc.type)}
                                    disabled={reuploadBusy[doc.type]}
                                    className="text-xs font-bold px-4 py-2 rounded-xl text-white disabled:opacity-60"
                                    style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)" }}
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
              <SectionCard title="Dirección de envío" icon="📦">
                <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
                  Esta dirección se usa para recibir tus compras. Puedes cambiarla en cualquier momento.
                </p>

                {addrError && (
                  <div className="mb-4 px-4 py-3 rounded-xl text-sm text-[var(--error-text)]" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
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
                    {zipColonias.length > 0 ? (
                      <select
                        value={addrForm.colonia}
                        onChange={e => setAddrForm(p => ({ ...p, colonia: e.target.value }))}
                        className="w-full rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#2563EB]/40 transition-all"
                        style={inputSelectStyle}
                      >
                        <option value="">Selecciona tu colonia</option>
                        {zipColonias.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <Input
                        value={addrForm.colonia}
                        onChange={v => setAddrForm(p => ({ ...p, colonia: v }))}
                        placeholder="Ej: Del Valle"
                      />
                    )}
                  </Field>

                  <Field label="Código postal" id="ajustes-zip">
                    <div className="relative">
                      <Input
                        id="ajustes-zip"
                        value={addrForm.zipCode}
                        onChange={v => setAddrForm(p => ({ ...p, zipCode: v.replace(/\D/g, "").slice(0, 5) }))}
                        placeholder="Ej: 03100"
                        aria-describedby={zipLookupDone ? "ajustes-zip-status" : zipLookupError ? "ajustes-zip-error" : undefined}
                      />
                      {zipLookupLoading && (
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin"
                          style={{ color: "var(--brand)" }} />
                      )}
                      {!zipLookupLoading && zipLookupDone && (
                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs" style={{ color: "#4ade80" }}>✓</span>
                      )}
                    </div>
                    {zipLookupDone && (
                      <p id="ajustes-zip-status" className="text-[11px] mt-1" style={{ color: "#4ade80" }}>
                        ✓ Colonia, ciudad y estado autocompletados
                      </p>
                    )}
                    {zipLookupError && (
                      <p id="ajustes-zip-error" role="alert" className="text-[11px] mt-1" style={{ color: "var(--error-text)" }}>
                        No se pudo verificar el código postal. Puedes llenar los campos manualmente o volver a intentar.
                      </p>
                    )}
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
                      className="w-full rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#2563EB]/40 transition-all"
                      style={inputSelectStyle}
                    >
                      <option value="">Selecciona tu estado</option>
                      {ESTADOS_MX.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                </div>

                {/* Preview */}
                {(addrForm.street || addrForm.colonia || addrForm.city) && (
                  <div className="mt-2 p-4 rounded-xl" style={{ background: "rgba(37,99,235,0.06)", border: "1px solid var(--border-brand)" }}>
                    <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>Vista previa</p>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      {[addrForm.street, addrForm.colonia, addrForm.city, addrForm.state, addrForm.zipCode].filter(Boolean).join(", ")}
                    </p>
                  </div>
                )}

                <div className="mt-5">
                  <SaveButton loading={addrLoading} saved={addrSaved} onClick={saveAddress} />
                </div>
              </SectionCard>
            )}

            {/* ── FORMA DE PAGO ── */}
            {activeSection === "pago" && (
              <SectionCard title="Forma de pago" icon="💳">
                {/* Saved cards (main wallet) — synced with the live wallet popup */}
                {savedCards.length > 0 && (
                  <div className="mb-5">
                    <p className="text-[11px] font-semibold uppercase mb-2" style={{ letterSpacing: "0.12em", color: "var(--text-muted)" }}>Tus tarjetas</p>
                    <div className="space-y-2">
                      {savedCards.map(c => (
                        <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={1.5} aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20" strokeLinecap="round"/></svg>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{(c.brand || "Tarjeta")} •••• {c.last4}</p>
                            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.expiry}{c.isDefault ? " · Predeterminada" : ""}</p>
                          </div>
                          <button onClick={() => removeCard(c.id)} className="text-xs" style={{ color: "var(--text-muted)" }} aria-label="Eliminar tarjeta">Eliminar</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
                  Los pagos en TCG Live se procesan con Mercado Pago — no necesitas guardar una tarjeta aquí.
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
                    <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Mercado Pago</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>Pago seguro al momento de confirmar tu compra</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {["Visa", "Mastercard", "OXXO", "SPEI", "Saldo MP"].map(m => (
                        <span
                          key={m}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded"
                          style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }}
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="text-xs mt-4" style={{ color: "var(--text-muted)" }}>
                  Para pujar en subastas primero necesitas tener tu dirección de envío guardada.
                  Esto garantiza que podamos enviarte la carta si ganas.
                </p>

                {/* Datos para cobro */}
                <div className="mt-6 pt-6" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)" }}>
                    Datos para cobro (vendedores)
                  </p>
                  <p className="text-[11px] mb-5" style={{ color: "var(--text-muted)" }}>
                    Necesario para recibir el pago de tus ventas. El dinero se libera automáticamente cuando el comprador recibe su paquete.
                  </p>

                  {payoutError && (
                    <div className="mb-4 px-4 py-3 rounded-xl text-sm text-[var(--error-text)]" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
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

                  <div className="mt-4">
                    <SaveButton loading={payoutLoading} saved={payoutSaved} onClick={savePayout} />
                  </div>
                </div>
              </SectionCard>
            )}

            {/* ── NOTIFICACIONES ── */}
            {activeSection === "notificaciones" && (
              <SectionCard title="Preferencias de notificaciones" icon="🔔">
                <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
                  Elige qué notificaciones deseas recibir por correo electrónico.
                </p>

                <div className="space-y-0">
                  {([
                    { key: "outbid" as const,      label: "Me superaron una puja",      desc: "Cuando alguien puja más que tú en una subasta activa" },
                    { key: "orderUpdate" as const, label: "Actualizaciones de órdenes", desc: "Confirmación de compra, envío y entrega" },
                    { key: "newMessage" as const,  label: "Mensajes nuevos",             desc: "Cuando recibes un mensaje de un vendedor o comprador" },
                    { key: "promotions" as const,  label: "Promociones y novedades",     desc: "Subastas especiales, nuevas cartas y ofertas exclusivas" },
                  ]).map(({ key, label, desc }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-4 py-4"
                      style={{ borderBottom: "1px solid var(--border-subtle)" }}
                    >
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{label}</p>
                        <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{desc}</p>
                      </div>
                      <button
                        onClick={() => saveNotifs({ ...notifs, [key]: !notifs[key] })}
                        className="relative w-11 h-6 rounded-full transition-all shrink-0"
                        style={{ background: notifs[key] ? "#2563EB" : "var(--bg-elevated)", border: "1px solid var(--border)" }}
                        aria-checked={notifs[key]}
                        role="switch"
                        aria-label={label}
                      >
                        <span
                          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                          style={{ left: notifs[key] ? "calc(100% - 22px)" : "2px" }}
                        />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-5 p-4 rounded-xl" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.15)" }}>
                  <p className="text-xs" style={{ color: "#f59e0b" }}>
                    Las notificaciones por email se enviarán a{" "}
                    <strong style={{ color: "var(--text-primary)" }}>{user.email}</strong>.{" "}
                    Las notificaciones críticas de seguridad siempre se envían independientemente de estas preferencias.
                  </p>
                </div>
              </SectionCard>
            )}

          </div>
        </div>
      </main>

      {/* ── MODAL SOLICITUD VENDEDOR ── */}
      {showSellerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm" style={{ background: "rgba(0,0,0,0.75)" }}>
          <div
            ref={sellerModalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="seller-modal-title"
            tabIndex={-1}
            className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-6 focus:outline-none"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}
          >
            <button
              onClick={() => setShowSellerModal(false)}
              aria-label="Cerrar"
              className="absolute top-4 right-4 text-xl w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--text-muted)", background: "var(--bg-elevated)" }}
            >
              ✕
            </button>

            <h2 id="seller-modal-title" className="text-xl font-black mb-1" style={{ color: "var(--text-primary)" }}>Solicitar cuenta de vendedor</h2>
            <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
              Paso {sellerStep} de 2 — {sellerStep === 1 ? "Datos personales" : "Documentos requeridos"}
            </p>

            {/* Step progress bar */}
            <div className="flex gap-2 mb-6">
              {[1, 2].map(step => (
                <div
                  key={step}
                  className="flex-1 h-1.5 rounded-full transition-all"
                  style={{ background: sellerStep >= step ? "#2563EB" : "var(--border)" }}
                />
              ))}
            </div>

            {sellerError && (
              <div className="mb-4 px-4 py-3 rounded-xl text-sm text-[var(--error-text)]" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                {sellerError}
              </div>
            )}

            {sellerStep === 1 && (
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="seller-fullname" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Nombre completo</label>
                  <input
                    id="seller-fullname"
                    value={sellerForm.fullName}
                    onChange={e => setSellerForm(p => ({ ...p, fullName: e.target.value }))}
                    placeholder="Como aparece en tu INE"
                    className="w-full rounded-xl px-4 py-3 text-sm placeholder:text-zinc-500 focus:ring-2 focus:ring-[#2563EB]/40 transition-all"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                </div>
                <div>
                  <label htmlFor="seller-state" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>Estado</label>
                  <select
                    id="seller-state"
                    value={sellerForm.state}
                    onChange={e => setSellerForm(p => ({ ...p, state: e.target.value }))}
                    className="w-full rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#2563EB]/40 transition-all"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    <option value="">Selecciona tu estado</option>
                    {ESTADOS_MX.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="seller-description" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>¿Qué vendes y cuál es tu experiencia?</label>
                  <textarea
                    id="seller-description"
                    value={sellerForm.description}
                    onChange={e => setSellerForm(p => ({ ...p, description: e.target.value }))}
                    rows={4}
                    placeholder="Ej: Vendo cartas de Pokémon y MTG, llevo 3 años coleccionando..."
                    maxLength={500}
                    aria-describedby="seller-description-count"
                    className="w-full rounded-xl px-4 py-3 text-sm placeholder:text-zinc-500 focus:ring-2 focus:ring-[#2563EB]/40 transition-all resize-none"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                  <p id="seller-description-count" className="text-[11px] mt-1 text-right" style={{ color: "var(--text-muted)" }}>{sellerForm.description.length}/500</p>
                </div>
                <button
                  onClick={() => {
                    if (!sellerForm.fullName || !sellerForm.state || sellerForm.description.length < 20) {
                      setSellerError("Completa todos los campos (descripción mínimo 20 caracteres).");
                      return;
                    }
                    setSellerError(""); setSellerStep(2);
                  }}
                  className="w-full py-3.5 rounded-xl font-black text-white mt-2 transition-all"
                  style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}
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
                    <div
                      key={doc.type}
                      className="rounded-xl p-4"
                      style={{
                        background: uploaded ? "rgba(74,222,128,0.04)" : "var(--bg-elevated)",
                        border: `1px solid ${uploaded ? "rgba(74,222,128,0.3)" : "var(--border)"}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{doc.label}</p>
                          <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>{doc.hint}</p>
                        </div>
                        {uploaded  && <span className="text-[11px] font-black text-green-400 shrink-0">✓ Listo</span>}
                        {uploading && <span className="text-[11px] shrink-0 animate-pulse" style={{ color: "var(--text-secondary)" }}>Subiendo...</span>}
                      </div>
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(doc.type, f, false); }}
                        className="w-full text-xs file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-blue-600/20 file:text-blue-300 hover:file:bg-blue-600/30 cursor-pointer"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      {doc.needsDate && (
                        <div className="mt-2">
                          <label htmlFor={`apply-date-${doc.type}`} className="text-[11px] block mb-1" style={{ color: "var(--text-muted)" }}>Fecha de emisión</label>
                          <input
                            type="date"
                            id={`apply-date-${doc.type}`}
                            value={docDates[doc.type] ?? ""}
                            onChange={e => setDocDates(p => ({ ...p, [doc.type]: e.target.value }))}
                            className="rounded-lg px-3 py-1.5 text-xs focus:border-[#2563EB]/60"
                            style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => setSellerStep(1)}
                    className="flex-1 py-3 rounded-xl font-bold text-sm transition-all"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
                  >
                    ← Atrás
                  </button>
                  <button
                    onClick={handleSellerApply}
                    disabled={sellerSubmitting}
                    className="flex-1 py-3 rounded-xl font-black text-white text-sm disabled:opacity-60 transition-all"
                    style={{ background: "linear-gradient(135deg, #059669, #10b981)", boxShadow: "0 4px 16px rgba(5,150,105,0.3)" }}
                  >
                    {sellerSubmitting ? "Enviando..." : "Enviar solicitud"}
                  </button>
                </div>
                <p className="text-[11px] text-center" style={{ color: "var(--text-muted)" }}>
                  Tu solicitud será revisada en 1–3 días hábiles
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
