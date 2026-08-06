"use client";
import { useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <Navbar />
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4" role="alert">
        <div className="text-6xl mb-6" aria-hidden="true">⚠️</div>
        <h1 className="text-2xl font-black mb-3" style={{ color: "var(--text-primary)" }}>Algo salió mal</h1>
        <p className="mb-8 max-w-sm" style={{ color: "var(--text-muted)" }}>Ocurrió un error inesperado. Puedes intentar de nuevo o regresar al inicio.</p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="px-6 py-3 rounded-2xl font-bold text-white text-sm"
            style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 4px 20px rgba(37,99,235,0.4)" }}
          >
            Intentar de nuevo
          </button>
          <Link
            href="/"
            className="px-6 py-3 rounded-2xl font-bold text-sm"
            style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
