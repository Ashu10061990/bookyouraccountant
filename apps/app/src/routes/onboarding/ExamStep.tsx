import type { ExamPaper, ExamResult } from "@bya/shared";
import { EXAM_POLICY } from "@bya/shared";
import { useState } from "react";
import { Button } from "@bya/ui";
import { startExam } from "../../lib/queries.js";
import { ErrorNote, Panel, Pill, Spinner } from "../../components/ui.js";
import { LiveExam } from "./LiveExam.js";
import { ExamResult as ExamResultView } from "./ExamResult.js";

type Phase = "instructions" | "loading" | "exam" | "result";

export function ExamStep({ onPass }: { onPass: () => void }) {
  const [phase, setPhase] = useState<Phase>("instructions");
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [err, setErr] = useState("");

  const begin = async () => {
    setPhase("loading");
    setErr("");
    try {
      setPaper(await startExam());
      setPhase("exam");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Could not load the exam.");
      setPhase("instructions");
    }
  };

  if (phase === "loading")
    return (
      <Panel title="Loading examination…">
        <Spinner label="Fetching questions securely." />
      </Panel>
    );

  if (phase === "exam" && paper !== null)
    return (
      <LiveExam
        questions={paper.questions}
        sessionId={paper.sessionId}
        secondsPerQ={paper.secondsPerQuestion}
        onResult={(r) => {
          setResult(r);
          setPhase("result");
        }}
      />
    );

  if (phase === "result" && result !== null)
    return (
      <ExamResultView
        result={result}
        onContinue={onPass}
        onRetry={() => {
          setResult(null);
          setPhase("instructions");
        }}
      />
    );

  return (
    <Panel title="Online screen test" sub="A short timed assessment you take right here.">
      {err !== "" && <ErrorNote>{err}</ErrorNote>}
      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone="navy">{EXAM_POLICY.questionsPerAttempt} questions</Pill>
        <Pill tone="line">{EXAM_POLICY.secondsPerQuestion}s per question</Pill>
        <Pill tone="line">Pass mark {Math.round(EXAM_POLICY.passRatio * 100)}%</Pill>
      </div>
      <ul className="mb-6 list-disc space-y-2 pl-5 text-sm text-ink-soft">
        <li>
          Each question has a {EXAM_POLICY.secondsPerQuestion}-second timer. When it hits 0, or you
          answer, the next loads. You cannot go back.
        </li>
        <li>Take it in one sitting. Don&apos;t refresh or close the tab.</li>
        <li>Unanswered questions are marked wrong. You may retake if you don&apos;t pass.</li>
      </ul>
      <Button onClick={() => void begin()}>I understand — start the timed test</Button>
    </Panel>
  );
}
