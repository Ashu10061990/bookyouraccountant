import type { ExamResult as Result } from "@bya/shared";
import { EXAM_POLICY } from "@bya/shared";
import { Button } from "@bya/ui";
import { Panel } from "../../components/ui.js";

export function ExamResult({
  result,
  onContinue,
  onRetry,
}: {
  result: Result;
  onContinue: () => void;
  onRetry: () => void;
}) {
  const pct = result.total === 0 ? 0 : Math.round((result.score / result.total) * 100);
  const passRatioPct = Math.round(EXAM_POLICY.passRatio * 100);
  return (
    <Panel>
      <div className="mx-auto max-w-lg py-2 text-center">
        <h2 className="font-display text-2xl font-semibold text-ink">
          {result.passed ? "You passed — congratulations!" : "Not quite this time"}
        </h2>
        <p className="mt-2 text-ink-soft">
          You scored{" "}
          <strong className={`font-mono ${result.passed ? "text-navy" : "text-danger"}`}>
            {result.score}/{result.total}
          </strong>{" "}
          ({pct}%).{result.passed ? " Register your profile to go live to businesses." : ""}
        </p>
        {!result.passed && (
          <p className="mt-4 rounded-lg bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
            The pass mark is {passRatioPct}%. Attempt policy: 2 attempts per 180 days.
          </p>
        )}
        <div className="mt-6">
          {result.passed ? (
            <Button onClick={onContinue}>Continue to registration</Button>
          ) : (
            <Button variant="ghost" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
