"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail]             = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [rememberMe, setRememberMe]   = useState(true);
  const [returning, setReturning]     = useState(false);

  // "Bienvenido de vuelta" only if a session existed before on this device
  useEffect(() => {
    setReturning(typeof window !== "undefined" && localStorage.getItem("tcg_returning") === "1");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password, rememberMe);
      router.push("/auctions");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Credenciales incorrectas. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  // Demo shortcut: fill + log in with a test account in one tap
  const DEMO = [
    { label: "Vendedor", user: "tcg_master_mx", email: "vendedor@tcg.mx" },
    { label: "Cliente",  user: "ana_collector", email: "ana@tcg.mx" },
  ];
  async function quickLogin(email: string) {
    setEmail(email);
    setPassword("password123");
    setLoading(true);
    setError("");
    try {
      await login(email, "password123", rememberMe);
      router.push("/auctions");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "No se pudo iniciar sesión.");
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
          className="absolute top-0 left-0 w-48 h-48 rounded-full blur-3xl"
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
          className="absolute top-[10%] left-[7%] text-6xl float select-none"
          style={{ filter: "blur(2px)", opacity: 0.065, animationDelay: "0s" }}
        >🃏</span>
        <span
          className="absolute top-[22%] right-[5%] text-5xl float select-none"
          style={{ filter: "blur(1.5px)", opacity: 0.055, animationDelay: "1.3s" }}
        >⚡</span>
        <span
          className="absolute bottom-[22%] left-[4%] text-7xl float select-none"
          style={{ filter: "blur(3px)", opacity: 0.045, animationDelay: "2.5s" }}
        >🎴</span>
        <span
          className="absolute bottom-[35%] right-[9%] text-5xl float select-none"
          style={{ filter: "blur(2px)", opacity: 0.055, animationDelay: "0.7s" }}
        >✨</span>
        <span
          className="absolute top-[58%] left-[14%] text-4xl float select-none"
          style={{ filter: "blur(1px)", opacity: 0.04, animationDelay: "3.1s" }}
        >🌟</span>
        <span
          className="absolute top-[75%] right-[18%] text-5xl float select-none"
          style={{ filter: "blur(2.5px)", opacity: 0.045, animationDelay: "1.8s" }}
        >🃏</span>
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
            {returning ? "Bienvenido de vuelta" : "Inicia sesión en tu cuenta"}
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            {returning ? "Inicia sesión en tu cuenta" : "Bienvenido a TCG Live"}
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
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

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

            {/* Email field */}
            <div>
              <label htmlFor="login-email" className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
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
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
              <div className="flex justify-between items-center mb-2">
                <label htmlFor="login-password" className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Contraseña
                </label>
                <Link
                  href="/olvide-contrasena"
                  className="text-xs font-medium transition-opacity hover:opacity-80"
                  style={{ color: "var(--accent-text)" }}
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
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
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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

            {/* Remember me for 30 days */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none -mt-1">
              <span
                className="relative flex items-center justify-center w-5 h-5 rounded-md transition-colors shrink-0"
                style={{
                  background: rememberMe ? "var(--brand)" : "var(--bg-input)",
                  border: `1px solid ${rememberMe ? "var(--brand)" : "var(--border)"}`,
                }}
              >
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only"
                />
                {rememberMe && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Recordarme por 30 días</span>
            </label>

            {/* Submit button with spinner */}
            <button
              type="submit"
              disabled={loading}
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
                  Iniciando sesión...
                </>
              ) : (
                "Iniciar sesión →"
              )}
            </button>
          </form>

          {/* Demo shortcuts — one-tap sign in for testing */}
          <div className="mt-5 pt-5" style={{ borderTop: "1px solid var(--border)" }}>
            <p className="text-center text-xs font-semibold mb-2.5" style={{ color: "var(--text-muted)" }}>
              Acceso rápido (demo)
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              {DEMO.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  onClick={() => quickLogin(d.email)}
                  disabled={loading}
                  className="flex flex-col items-center gap-0.5 rounded-xl py-2.5 px-2 text-center transition-colors disabled:opacity-50"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)" }}
                >
                  <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                    {d.label}
                  </span>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    @{d.user}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center mt-6 text-sm" style={{ color: "var(--text-muted)" }}>
          ¿No tienes cuenta?{" "}
          <Link
            href="/register"
            className="font-semibold transition-opacity hover:opacity-80"
            style={{ color: "var(--accent-text)" }}
          >
            Regístrate gratis →
          </Link>
        </p>
      </main>
    </div>
  );
}
