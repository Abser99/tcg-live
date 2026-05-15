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
    <div className="min-h-screen bg-[#0F0F14] text-white flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-[#6C3AE8]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Link href="/">
            <div
              className="w-12 h-12 rounded-2xl bg-[#6C3AE8] flex items-center justify-center font-black text-xl mb-4"
              style={{ boxShadow: "0 0 30px rgba(108,58,232,0.5)" }}
            >
              T
            </div>
          </Link>
          <h1 className="text-3xl font-black">Recuperar contraseña</h1>
          <p className="text-zinc-500 mt-2 text-sm text-center">
            Te enviaremos un enlace para restablecer tu contraseña
          </p>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{ background: "#16161E", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {sent ? (
            <div className="text-center">
              <div className="text-4xl mb-4">📬</div>
              <p className="font-black text-lg mb-2">Revisa tu correo</p>
              <p className="text-zinc-400 text-sm leading-relaxed">
                Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña. Revisa también tu carpeta de spam.
              </p>
              <Link
                href="/login"
                className="block mt-6 text-sm text-[#a78bfa] hover:text-white transition-colors font-semibold"
              >
                ← Volver a iniciar sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {error && (
                <div
                  className="rounded-xl px-4 py-3 text-sm text-red-400 font-medium"
                  style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)" }}
                >
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold mb-2 text-zinc-300">
                  Correo electrónico
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.com"
                  required
                  className="w-full bg-[#0F0F14] border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#6C3AE8]/60 transition-colors text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl font-black text-white transition-all active:scale-95 disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)",
                  boxShadow: "0 8px 25px rgba(108,58,232,0.35)",
                }}
              >
                {loading ? "Enviando..." : "Enviar enlace de recuperación"}
              </button>

              <Link
                href="/login"
                className="text-center text-sm text-zinc-500 hover:text-white transition-colors"
              >
                ← Volver a iniciar sesión
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
