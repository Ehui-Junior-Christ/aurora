import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import SmoothScroll from "@/components/SmoothScroll";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

// Self-hosted variable fonts (latin subset from Google Fonts): builds no longer
// depend on fetching fonts.googleapis.com, which broke CI builds.
const syne = localFont({
  src: "./fonts/syne-latin.woff2",
  variable: "--font-syne",
  weight: "400 800",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin.woff2",
  variable: "--font-space",
  weight: "300 700",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin.woff2",
  variable: "--font-mono-face",
  weight: "400 500",
  display: "swap",
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
      className={`${syne.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <link rel="preconnect" href="https://www.youtube.com" />
        <link rel="preconnect" href="https://www.googleapis.com" />
        {/* Intro plays once per session: decided before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{document.documentElement.dataset.intro=sessionStorage.getItem("aurora:intro")?"skip":"play"}catch(e){document.documentElement.dataset.intro="skip"}',
          }}
        />
      </head>
      <body suppressHydrationWarning className="font-sans antialiased">
        <ServiceWorkerRegister />
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
