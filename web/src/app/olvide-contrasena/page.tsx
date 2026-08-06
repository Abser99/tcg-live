"use client";

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch {
      setError("Ocurrió un error. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full blur-3xl pointer-events-none" style={{ background: "rgba(37,99,235,0.1)" }} />

      <main id="main" className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Link href="/">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl mb-4 text-white"
              style={{ background: "var(--brand)", boxShadow: "0 0 30px rgba(37,99,235,0.5)" }}
            >
              T
            </div>
          </Link>
          <h1 className="text-3xl font-black">Recuperar contraseña</h1>
          <p className="mt-2 text-sm text-center" style={{ color: "var(--text-muted)" }}>
            Te enviaremos un enlace para restablecer tu contraseña
          </p>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          {sent ? (
            <div className="text-center">
              <div className="text-4xl mb-4">📬</div>
              <p className="font-black text-lg mb-2">Revisa tu correo</p>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. Revisa también tu carpeta de spam.
              </p>
              <Link
                href="/login"
                className="block mt-6 text-sm text-[var(--accent-text)] hover:text-[var(--text-primary)] transition-colors font-semibold"
              >
                ← Volver a iniciar sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {error && (
                <div
                  className="rounded-xl px-4 py-3 text-sm text-[var(--error-text)] font-medium"
                  style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}
                >
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
                  className="w-full rounded-xl px-4 py-3.5 transition-colors text-sm"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl font-black text-white transition-all active:scale-95 disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                  boxShadow: "0 8px 25px rgba(37,99,235,0.35)",
                }}
              >
                {loading ? "Enviando..." : "Enviar enlace de recuperación"}
              </button>

              <Link
                href="/login"
                className="text-center text-sm hover:text-[var(--text-primary)] transition-colors"
                style={{ color: "var(--text-muted)" }}
              >
                ← Volver a iniciar sesión
              </Link>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
