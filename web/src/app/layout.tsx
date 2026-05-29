import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth";
import RedirectHandler from "@/components/RedirectHandler";
import PostHogProvider from "@/components/PostHogProvider";
import PageViewTracker from "@/components/PageViewTracker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TCG Live — Subastas en vivo de cartas TCG en México",
  description:
    "Compra y vende cartas de Pokémon en streaming de baja latencia. IA que identifica tus cartas automáticamente y pagos protegidos con Mercado Pago.",
  manifest: "/manifest.json",
  themeColor: "#6C3AE8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0F0F14]">
        <PostHogProvider>
          <AuthProvider>
            <RedirectHandler />
            <PageViewTracker />
            {children}
          </AuthProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
