import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth-context.js";
import { Spinner } from "../components/ui.js";

/** Renders children only when signed in; otherwise sends to /signin. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="grid min-h-screen place-items-center bg-paper">
        <Spinner label="Loading…" />
      </div>
    );
  if (user === null) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}
