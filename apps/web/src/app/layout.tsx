import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

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
    <html lang="en">
      <body className="bg-paper font-body text-ink">{children}</body>
    </html>
  );
}
