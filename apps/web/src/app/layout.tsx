import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter } from "../components/SiteFooter";
import { SiteNav } from "../components/SiteNav";
import "./globals.css";

// Self-hosted by next/font — no runtime request to Google, and the brand fonts
// (Space Grotesk display, Plus Jakarta Sans body) match the design tokens.
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
});
const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://bookyouraccountant.com"),
  title: {
    default: "BookYourAccountant — CA-verified accountants on demand",
    template: "%s | BookYourAccountant",
  },
  description:
    "Book verified accountants by the day. Live dashboard, monthly MIS, GST invoices. Pay only for the days you need.",
  openGraph: {
    type: "website",
    siteName: "BookYourAccountant",
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="bg-white text-ink">
        <SiteNav />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
