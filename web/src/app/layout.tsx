import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/auth";
import { ThemeProvider } from "@/contexts/theme";
import RedirectHandler from "@/components/RedirectHandler";
import PostHogProvider from "@/components/PostHogProvider";
import PageViewTracker from "@/components/PageViewTracker";
import EdgeBackGesture from "@/components/EdgeBackGesture";
import FavoriteSellerAlerts from "@/components/FavoriteSellerAlerts";

// Inter — the typeface SugarCo TCG uses. Kept on the same CSS variable so every
// existing `var(--font-geist-sans)` reference picks it up without edits.
const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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
};

export const viewport: Viewport = {
  themeColor: "#2563EB",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the theme applies data-theme to <html> outside React's render,
    // so the server markup can't match. This scopes the ignore to <html>'s own attributes.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={{ background: "var(--bg-base)" }}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-xl focus:font-semibold focus:text-sm"
          style={{ background: "var(--brand)", color: "#fff" }}
        >
          Saltar al contenido principal
        </a>
        <PostHogProvider>
          <ThemeProvider>
            <AuthProvider>
              <RedirectHandler />
              <PageViewTracker />
              <EdgeBackGesture />
              <FavoriteSellerAlerts />
              {children}
            </AuthProvider>
          </ThemeProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
