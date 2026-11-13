import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";

import { ServiceWorkerRegistration } from "@/offline/service-worker-registration";
import { ThemeProvider } from "@/shared/theme/theme-provider";
import "@/styles/globals.css";
import { BRAND_TOKENS } from "@/styles/tokens/brand";

// Charte générale : Inter (D-Q11, recommandation appliquée par défaut).
const generalFont = Inter({
  variable: "--font-general",
  subsets: ["latin"],
  display: "swap",
});

// Charte Restaurant : Plus Jakarta Sans (D-017).
const restaurantFont = Plus_Jakarta_Sans({
  variable: "--font-restaurant",
  subsets: ["latin"],
  display: "swap",
});

const isIndexable = process.env.NEXT_PUBLIC_SITE_INDEXABLE === "true";

export const metadata: Metadata = {
  title: {
    default: "OPTIMA · Gestion commerciale multi-établissements",
    template: "%s · OPTIMA",
  },
  description:
    "Caisse, stock, commandes et clôtures, même sans connexion. Chaque établissement garde ses données, le propriétaire voit l'ensemble.",
  applicationName: "OPTIMA",
  appleWebApp: { capable: true, title: "OPTIMA", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
  // Indexation désactivée tant que D-Q01 n'est pas tranchée.
  robots: isIndexable ? { index: true, follow: true } : { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND_TOKENS.white },
    { media: "(prefers-color-scheme: dark)", color: BRAND_TOKENS.darkBackground },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      suppressHydrationWarning
      className={`${generalFont.variable} ${restaurantFont.variable} antialiased`}
    >
      <body className="min-h-dvh">
        <ThemeProvider>{children}</ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
