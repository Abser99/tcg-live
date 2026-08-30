"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Turnstile } from "@marsidev/react-turnstile";
import { useAuth } from "@/contexts/auth";

// Replace with real Cloudflare Turnstile site key from dash.cloudflare.com
const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "1x00000000000000000000AA";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm]       = useState({ name: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [cfToken, setCfToken] = useState<string | null>(null);
  const turnstileRef           = useRef<any>(null);
  const [showPassword, setShowPassword]   = useState(false);
  const [showConfirm, setShowConfirm]     = useState(false);
  const [isAdult, setIsAdult]             = useState(false);
  const [birthDate, setBirthDate]         = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  function set(key: string, val: string) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (!cfToken) {
      setError("Completa la verificación de seguridad.");
      return;
    }
    if (!birthDate) {
      setError("Ingresa tu fecha de nacimiento.");
      return;
    }
    // Mirrors the server's check so the person hears it before the round trip; the
    // server decides either way.
    const dob = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const mth = today.getMonth() - dob.getMonth();
    if (mth < 0 || (mth === 0 && today.getDate() < dob.getDate())) age--;
    if (Number.isNaN(age) || age < 18) {
      setError("Debes tener al menos 18 años para registrarte.");
      return;
    }
    if (!isAdult) {
      setError("Debes confirmar que eres mayor de 18 años.");
      return;
    }
    if (!acceptedTerms) {
      setError("Debes aceptar los términos y condiciones.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await register(form.name, form.email, form.password, isAdult, { birthDate, acceptedTerms });
      router.push("/auctions");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "No se pudo crear la cuenta. Intenta de nuevo.");
      turnstileRef.current?.reset();
      setCfToken(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      {/* Ambient glow backdrop */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-[130px]"
          style={{ background: "rgba(37,99,235,0.13)" }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-72 h-72 rounded-full blur-3xl"
          style={{ background: "rgba(59,130,246,0.07)" }}
        />
        <div
          className="absolute top-0 right-0 w-52 h-52 rounded-full blur-3xl"
          style={{ background: "rgba(37,99,235,0.06)" }}
        />
        {/* Dot grid */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, var(--text-primary) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            opacity: 0.025,
          }}
        />
      </div>

      {/* Floating TCG card decorations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <span
          className="absolute top-[8%] left-[6%] text-6xl float select-none"
          style={{ filter: "blur(2.5px)", opacity: 0.06, animationDelay: "0s" }}
        >🎴</span>
        <span
          className="absolute top-[20%] right-[5%] text-5xl float select-none"
          style={{ filter: "blur(1.5px)", opacity: 0.055, animationDelay: "1.5s" }}
        >⚡</span>
        <span
          className="absolute bottom-[18%] left-[4%] text-7xl float select-none"
          style={{ filter: "blur(3px)", opacity: 0.04, animationDelay: "2.8s" }}
        >🃏</span>
        <span
          className="absolute bottom-[40%] right-[7%] text-4xl float select-none"
          style={{ filter: "blur(2px)", opacity: 0.05, animationDelay: "0.6s" }}
        >✨</span>
        <span
          className="absolute top-[65%] left-[12%] text-4xl float select-none"
          style={{ filter: "blur(1px)", opacity: 0.04, animationDelay: "3.4s" }}
        >🌟</span>
      </div>

      {/* Form container */}
      <main id="main" className="relative w-full max-w-md slide-up">

        {/* Wordmark */}
        <div className="flex flex-col items-center mb-8">
          <Link href="/" className="group mb-5 flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-10 h-10 rounded-xl transition-transform group-hover:scale-105"
              style={{ background: "var(--brand-light)", color: "var(--brand-ink)" }}
            >
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M13 2 4.5 13.5H11l-1 8.5L19.5 10H13l0-8Z" />
              </svg>
            </div>
            <span className="font-semibold text-2xl tracking-tight" style={{ color: "var(--text-primary)" }}>
              TCG<span style={{ color: "var(--accent-text)" }}>Live</span>
            </span>
          </Link>
          <h1 className="text-3xl font-black" style={{ color: "var(--text-primary)" }}>
            Crea tu cuenta gratis
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Empieza a pujar y comprar hoy
          </p>
        </div>

        {/* Glass card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            boxShadow: "var(--card-shadow)",
          }}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            {/* Error pill */}
            {error && (
              <div
                className="slide-in flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-semibold"
                style={{
                  background: "rgba(248,113,113,0.12)",
                  border: "1px solid rgba(248,113,113,0.28)",
                  color: "var(--error-text)",
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Username field */}
            <div>
              <label htmlFor="register-name" className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                Nombre de usuario
              </label>
              <div className="relative">
                <span
                  className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                <input
                  id="register-name"
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="trainer_mx"
                  required
                  className="w-full rounded-xl pl-11 pr-4 py-3.5 text-sm transition-colors placeholder:opacity-40"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>
            </div>

            {/* Email field */}
            <div>
              <label htmlFor="register-email" className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                Correo electrónico
              </label>
              <div className="relative">
                <span
                  className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                  </svg>
                </span>
                <input
                  id="register-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="tu@correo.com"
                  required
                  className="w-full rounded-xl pl-11 pr-4 py-3.5 text-sm transition-colors placeholder:opacity-40"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label htmlFor="register-password" className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                Contraseña
              </label>
              <div className="relative">
                <span
                  className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  id="register-password"
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  className="w-full rounded-xl pl-11 pr-11 py-3.5 text-sm transition-colors placeholder:opacity-40"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  {showPassword ? (
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
            </div>

            {/* Confirm password field */}
            <div>
              <label htmlFor="register-confirm" className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                Confirmar contraseña
              </label>
              <div className="relative">
                <span
                  className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-muted)" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </span>
                <input
                  id="register-confirm"
                  type={showConfirm ? "text" : "password"}
                  value={form.confirm}
                  onChange={(e) => set("confirm", e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl pl-11 pr-11 py-3.5 text-sm transition-colors placeholder:opacity-40"
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.6)")}
                  onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  aria-label={showConfirm ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  {showConfirm ? (
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
            </div>

            {/* Cloudflare Turnstile — anti-bot */}
            <div className="flex flex-col items-start gap-1">
              <label className="block text-sm font-semibold mb-1" style={{ color: "var(--text-secondary)" }}>
                Verificación de seguridad
              </label>
              <Turnstile
                ref={turnstileRef}
                siteKey={TURNSTILE_SITE_KEY}
                onSuccess={setCfToken}
                onExpire={() => setCfToken(null)}
                onError={() => setCfToken(null)}
                options={{ theme: "auto", language: "es" }}
              />
            </div>

            {/* Date of birth — the server checks the age against this. */}
            <div>
              <label htmlFor="birthDate" className="block text-xs font-semibold mb-1.5" style={{ color: "var(--text-secondary)" }}>
                Fecha de nacimiento
              </label>
              <input
                id="birthDate"
                type="date"
                required
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
                className="w-full rounded-xl px-4 py-3 text-sm"
                style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)", fontSize: "16px" }}
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                TCG Live es solo para mayores de 18 años.
              </p>
            </div>

            {/* Age (18+) confirmation checkbox */}
            <label className="flex items-start gap-3 cursor-pointer mt-1">
              <input
                type="checkbox"
                required
                checked={isAdult}
                onChange={(e) => setIsAdult(e.target.checked)}
                className="mt-0.5 accent-blue-500"
              />
              <span className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Confirmo que soy <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>mayor de 18 años</span>.
              </span>
            </label>

            {/* Terms checkbox */}
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" required className="mt-0.5 accent-blue-500"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)} />
              <span className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Acepto los{" "}
                <Link href="/terminos" className="transition-opacity hover:opacity-80" style={{ color: "var(--accent-text)" }}>
                  Términos de Servicio
                </Link>{" "}
                y la{" "}
                <Link href="/privacidad" className="transition-opacity hover:opacity-80" style={{ color: "var(--accent-text)" }}>
                  Política de Privacidad
                </Link>
              </span>
            </label>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading || !cfToken || !isAdult || !acceptedTerms || !birthDate}
              className="w-full py-4 rounded-xl font-black text-white transition-all active:scale-[0.97] disabled:opacity-60 mt-1 flex items-center justify-center gap-2.5"
              style={{
                background: "linear-gradient(135deg, var(--brand), #3B82F6)",
                boxShadow: "0 8px 28px rgba(37,99,235,0.38)",
              }}
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin"
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Creando cuenta...
                </>
              ) : (
                "Crear cuenta gratis →"
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-sm" style={{ color: "var(--text-muted)" }}>
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="font-semibold transition-opacity hover:opacity-80"
            style={{ color: "var(--accent-text)" }}
          >
            Inicia sesión →
          </Link>
        </p>
      </main>
    </div>
  );
}
