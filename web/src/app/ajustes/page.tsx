"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { useAuth } from "@/contexts/auth";
import { usersApi, sellerApplicationsApi, type ApiUser, type SellerApplication } from "@/lib/api";

const ESTADOS_MX = ["Aguascalientes","Baja California","Baja California Sur","Campeche","Chiapas","Chihuahua","Ciudad de México","Coahuila","Colima","Durango","Guanajuato","Guerrero","Hidalgo","Jalisco","México","Michoacán","Morelos","Nayarit","Nuevo León","Oaxaca","Puebla","Querétaro","Quintana Roo","San Luis Potosí","Sinaloa","Sonora","Tabasco","Tamaulipas","Tlaxcala","Veracruz","Yucatán","Zacatecas"];

type Section = "cuenta" | "seguridad" | "direccion" | "notificaciones";

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: "cuenta",         label: "Información personal", icon: "👤" },
  { key: "seguridad",      label: "Contraseña",           icon: "🔒" },
  { key: "direccion",      label: "Dirección de envío",   icon: "📦" },
  { key: "notificaciones", label: "Notificaciones",        icon: "🔔" },
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
  const [activeSection, setActiveSection] = useState<Section>("cuenta");

  // Full user data (includes address fields)
  const [fullUser, setFullUser] = useState<ApiUser | null>(null);
  const [application, setApplication] = useState<SellerApplication | null | undefined>(undefined);

  // Profile form
  const [profileForm, setProfileForm] = useState({ username: "", displayName: "" });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");

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
    if (!user) return;
    Promise.all([
      usersApi.me().catch(() => null),
      sellerApplicationsApi.myApplication().catch(() => null),
    ]).then(([meRes, appRes]) => {
      if (meRes) {
        setFullUser(meRes.data);
        setProfileForm({ username: meRes.data.username, displayName: meRes.data.displayName ?? "" });
        setAddrForm({
          street:  meRes.data.street  ?? "",
          colonia: meRes.data.colonia ?? "",
          city:    meRes.data.city    ?? "",
          state:   meRes.data.state   ?? "",
          zipCode: meRes.data.zipCode ?? "",
        });
      }
      setApplication(appRes?.data ?? null);
    });

    // Load notification prefs from localStorage
    try {
      const saved = localStorage.getItem("tcg_notifs");
      if (saved) setNotifs(JSON.parse(saved));
    } catch {}
  }, [user]);

  async function saveProfile() {
    setProfileError("");
    setProfileLoading(true);
    setProfileSaved(false);
    try {
      await usersApi.updateProfile({ username: profileForm.username, displayName: profileForm.displayName });
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

  function saveNotifs(updated: typeof notifs) {
    setNotifs(updated);
    localStorage.setItem("tcg_notifs", JSON.stringify(updated));
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
                        ? { background: "rgba(108,58,232,0.15)", color: "#a78bfa" }
                        : { color: "#71717a" }
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
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black shrink-0"
                      style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 0 24px rgba(108,58,232,0.4)" }}
                    >
                      {initials}
                    </div>
                    <div>
                      <p className="font-bold">{fullUser?.displayName ?? user.username}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Miembro desde {memberSince}</p>
                      <span
                        className="inline-block mt-2 text-[10px] font-black px-2.5 py-1 rounded-full"
                        style={{ background: "rgba(108,58,232,0.15)", color: "#a78bfa" }}
                      >
                        {roleLabel[user.role] ?? user.role}
                      </span>
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
                            {application === null && "Solicita vender en TCG Live"}
                            {application?.status === "pending" && "Tu solicitud está en revisión"}
                            {application?.status === "approved" && "Solicitud aprobada"}
                            {application?.status === "rejected" && "Solicitud rechazada"}
                          </p>
                        </div>
                        {application === null && (
                          <Link
                            href="/perfil"
                            className="text-xs font-bold px-4 py-2 rounded-xl"
                            style={{ background: "rgba(5,150,105,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}
                          >
                            Solicitar →
                          </Link>
                        )}
                        {application?.status === "pending" && (
                          <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
                            ⏳ En revisión
                          </span>
                        )}
                        {application?.status === "approved" && (
                          <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}>
                            ✓ Aprobada
                          </span>
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
              </SectionCard>
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
    </div>
  );
}
