"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";

function ResetForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get("token") ?? "";

  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    if (!token) setError("Enlace inválido o expirado. Solicita uno nuevo.");
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError("Las contraseñas no coinciden"); return; }
    if (password.length < 8)  { setError("La contraseña debe tener al menos 8 caracteres"); return; }
    setLoading(true);
    setError("");
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.push("/login"), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "El enlace expiró o no es válido. Solicita uno nuevo.");
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
          <h1 className="text-3xl font-black">Nueva contraseña</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Elige una contraseña segura para tu cuenta</p>
        </div>

        <div
          className="rounded-2xl p-8"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          {done ? (
            <div className="text-center">
              <div className="text-4xl mb-4">✅</div>
              <p className="font-black text-lg mb-2">Contraseña actualizada</p>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Tu contraseña fue restablecida. Redirigiendo al inicio de sesión...
              </p>
              <Link href="/login" className="block mt-6 text-sm text-[var(--accent-text)] font-semibold hover:text-[var(--text-primary)] transition-colors">
                Ir a iniciar sesión →
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
                <label htmlFor="new-password" className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Nueva contraseña</label>
                <input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  className="w-full rounded-xl px-4 py-3.5 transition-colors text-sm"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Confirmar contraseña</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repite tu nueva contraseña"
                  required
                  className="w-full rounded-xl px-4 py-3.5 transition-colors text-sm"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !token}
                className="w-full py-4 rounded-xl font-black text-white transition-all active:scale-95 disabled:opacity-60"
                style={{
                  background: "linear-gradient(135deg, #2563EB, #3B82F6)",
                  boxShadow: "0 8px 25px rgba(37,99,235,0.35)",
                }}
              >
                {loading ? "Guardando..." : "Guardar nueva contraseña"}
              </button>

              <Link href="/olvide-contrasena" className="text-center text-xs hover:text-[var(--text-primary)] transition-colors" style={{ color: "var(--text-muted)" }}>
                Solicitar un nuevo enlace
              </Link>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
