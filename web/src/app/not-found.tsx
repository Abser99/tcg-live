import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function NotFound() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <Navbar />
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
        <div className="text-6xl mb-6" aria-hidden="true">🃏</div>
        <h1 className="text-4xl font-black mb-3" style={{ color: "var(--text-primary)" }}>404</h1>
        <p className="text-xl font-bold mb-2" style={{ color: "var(--text-secondary)" }}>Página no encontrada</p>
        <p className="mb-8 max-w-sm" style={{ color: "var(--text-muted)" }}>La página que buscas no existe o fue movida. ¿Quizás querías ver las subastas en vivo?</p>
        <Link
          href="/auctions"
          className="px-8 py-3 rounded-2xl font-bold text-white text-sm"
          style={{ background: "linear-gradient(135deg, #2563EB, #3B82F6)", boxShadow: "0 4px 20px rgba(37,99,235,0.4)" }}
        >
          Ver subastas →
        </Link>
      </div>
    </div>
  );
}
