import { Button } from "@bya/ui";
import { useNavigate } from "react-router-dom";

export function Landing() {
  const nav = useNavigate();
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-6 font-body text-ink">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-sage">BookYourAccountant</p>
        <h1 className="mt-3 font-display text-4xl font-bold text-navy">
          Become a verified accountant
        </h1>
        <p className="mt-3 text-ink-soft">
          Sign in with your mobile, pass a short qualifying exam, and go live to businesses.
        </p>
        <Button className="mt-8" onClick={() => void nav("/signin?role=accountant")}>
          Get started
        </Button>
      </div>
    </main>
  );
}
