import { Button } from "@bya/ui";
import { Route, Routes } from "react-router-dom";

function Home() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper font-body text-ink">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold text-navy">BookYourAccountant</h1>
        <p className="mt-2 text-ink-soft">Application shell — routes land here.</p>
        <Button className="mt-6">Get started</Button>
      </div>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  );
}
