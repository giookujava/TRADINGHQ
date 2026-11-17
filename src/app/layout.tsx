import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Noto_Sans_Georgian } from "next/font/google";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Geist has no Georgian glyphs; this font renders the Georgian UI with matching weight and rhythm.
const georgian = Noto_Sans_Georgian({ variable: "--font-georgian", subsets: ["georgian"], weight: "variable" });

export const metadata: Metadata = {
  title: { default: "TRADING HQ", template: "%s · TRADING HQ" },
  description: "Personal trading journal & performance analytics",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d12" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  return (
    // suppressHydrationWarning: data-theme is set by the inline script before React hydrates.
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} ${georgian.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full">
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
