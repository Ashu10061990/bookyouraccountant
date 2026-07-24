import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/auth-context.js";
import { bootstrapUser, useAccountant } from "../../lib/queries.js";
import { ErrorNote, Panel, Spinner, StepIndicator } from "../../components/ui.js";
import { ExamStep } from "./ExamStep.js";
import { ProfileStep } from "./ProfileStep.js";

type Stage = "resolving" | "exam" | "profile";

export function Onboarding() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [stage, setStage] = useState<Stage>("resolving");
  const [err, setErr] = useState("");

  const profile = useAccountant(user?.uid);

  useEffect(() => {
    // Resolve the entry state exactly once. After we leave "resolving", the
    // stage advances only through user actions (exam pass, registration) — this
    // effect must never re-derive it, or a re-run while the user is mid-profile
    // would regress them to the exam.
    if (stage !== "resolving") return;
    if (profile.isPending) return;
    if (profile.isError) {
      setErr("Couldn't reach the server. Is the API running on :8080?");
      return;
    }
    // Already have a profile → go to the terminal, which shows the verified
    // state (this slice's happy path: the profile is created only after the
    // exam pass, so it is born verified) or a pending state otherwise.
    if (profile.data !== null) {
      void nav("/accountant", { replace: true });
      return;
    }
    // No profile yet: ensure the user record exists (role gate), then exam.
    void (async () => {
      try {
        await bootstrapUser(user?.phoneNumber ?? undefined);
        setStage("exam");
      } catch (error) {
        setErr(error instanceof Error ? error.message : "Could not set up your account.");
      }
    })();
  }, [stage, profile.isPending, profile.isError, profile.data, user, nav]);

  return (
    <div className="min-h-screen bg-paper px-6 py-10 font-body">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex justify-end">
          <button
            type="button"
            onClick={() =>
              void signOut()
                .then(() => nav("/", { replace: true }))
                .catch(() => setErr("Could not sign out. Try again."))
            }
            className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-soft"
          >
            Sign out
          </button>
        </div>

        {stage !== "resolving" && (
          <StepIndicator steps={["Online test", "Profile"]} current={stage === "exam" ? 0 : 1} />
        )}

        {err !== "" ? (
          <Panel title="Something went wrong">
            <ErrorNote>{err}</ErrorNote>
          </Panel>
        ) : stage === "resolving" ? (
          <Panel title="Getting you set up…">
            <Spinner label="One moment." />
          </Panel>
        ) : stage === "exam" ? (
          <ExamStep onPass={() => setStage("profile")} />
        ) : (
          <ProfileStep onDone={() => void nav("/accountant", { replace: true })} />
        )}
      </div>
    </div>
  );
}
