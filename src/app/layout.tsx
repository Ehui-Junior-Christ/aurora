import type { Metadata, Viewport } from "next";
import { Syne, Space_Grotesk } from "next/font/google";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["400", "500", "600", "700", "800"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "AURORA — Lecteur de musique génératif",
  description:
    "Lecteur de musique local 100 % hors-ligne. Chaque piste respire à travers un organisme WebGL généré de manière procédurale.",
  applicationName: "AURORA",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
  other: {
    google: "notranslate",
  },
};

export const viewport: Viewport = {
  themeColor: "#050508",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      translate="no"
      suppressHydrationWarning
      className={`${syne.variable} ${spaceGrotesk.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://www.youtube.com" />
        <link rel="preconnect" href="https://www.googleapis.com" />
      </head>
      <body suppressHydrationWarning className="font-sans antialiased">
        <ServiceWorkerRegister />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
