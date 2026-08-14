import type { Metadata, Viewport } from "next";
import { Amiri, Geist, IBM_Plex_Sans_Arabic, PT_Serif } from "next/font/google";
import { LocaleProvider } from "@/lib/i18n/client";
import { localeDirection } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

/* Interface type — matches the Stitch reference (Geist for chrome). */
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

/* Interface type for Arabic, and the family used for attachment chips. */
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "600"],
  variable: "--font-plex-arabic",
  display: "swap",
});

/* Document type. The same two families are embedded in the exported PDF, so the
 * editor is a faithful preview of the printed result. */
const ptSerif = PT_Serif({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-pt-serif",
  display: "swap",
});

const amiri = Amiri({
  subsets: ["arabic", "latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-amiri",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lexis — Reports with embedded evidence",
  description:
    "Write professional reports, attach supporting PDF evidence to specific content, and export one self-contained PDF that works offline.",
};

export const viewport: Viewport = {
  themeColor: "#f9f9f9",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      dir={localeDirection(locale)}
      className={`${geist.variable} ${plexArabic.variable} ${ptSerif.variable} ${amiri.variable}`}
    >
      <body className="min-h-full antialiased">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
