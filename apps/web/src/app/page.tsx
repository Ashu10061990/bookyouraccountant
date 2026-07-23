import { Button } from "@bya/ui";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CA-verified accountants on demand for India's MSMEs",
  description:
    "You don't need a full-time accountant. Book a verified professional for the days you need.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <main className="grid min-h-screen place-items-center">
      <div className="text-center">
        <h1 className="font-display text-4xl font-bold text-navy">BookYourAccountant</h1>
        <p className="mt-3 text-ink-soft">Marketing site shell — pages land here.</p>
        <Button className="mt-6">Get started</Button>
      </div>
    </main>
  );
}
