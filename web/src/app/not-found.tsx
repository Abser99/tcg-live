import Link from "next/link";
import Navbar from "@/components/Navbar";

export default function NotFound() {
  return (
    <div className="min-h-screen" style={{ background: "#0F0F14" }}>
      <Navbar />
      <div className="flex flex-col items-center justify-center min-h-[80vh] text-center px-4">
        <div className="text-6xl mb-6">🃏</div>
        <h1 className="text-4xl font-black text-white mb-3">404</h1>
        <p className="text-xl font-bold text-zinc-300 mb-2">Página no encontrada</p>
        <p className="text-zinc-500 mb-8 max-w-sm">La página que buscas no existe o fue movida. ¿Quizás querías ver las subastas en vivo?</p>
        <Link
          href="/auctions"
          className="px-8 py-3 rounded-2xl font-bold text-white text-sm"
          style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)", boxShadow: "0 4px 20px rgba(108,58,232,0.4)" }}
        >
          Ver subastas →
        </Link>
      </div>
    </div>
  );
}
