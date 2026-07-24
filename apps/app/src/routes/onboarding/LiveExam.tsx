import type { ExamResult, PublicQuestion } from "@bya/shared";
import { useEffect, useRef, useState } from "react";
import { Button } from "@bya/ui";
import { submitExam } from "../../lib/queries.js";
import { ErrorNote, Panel, Pill, Spinner } from "../../components/ui.js";
import { TimerRing } from "../../components/TimerRing.js";

export function LiveExam({
  questions,
  sessionId,
  secondsPerQ,
  onResult,
}: {
  questions: PublicQuestion[];
  sessionId: string;
  secondsPerQ: number;
  onResult: (r: ExamResult) => void;
}) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [remaining, setRemaining] = useState(secondsPerQ);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState("");

  const answersRef = useRef<Record<number, number>>({});
  const advancedFor = useRef(-1); // highest index advanced FROM
  const submitted = useRef(false); // hard idempotency guard

  const send = async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    setSubmitErr("");
    try {
      const arr = questions.map((_q, idx) => answersRef.current[idx] ?? -1);
      onResult(await submitExam({ sessionId, answers: arr }));
    } catch (error) {
      submitted.current = false; // allow manual retry
      setSubmitErr(error instanceof Error ? error.message : "Could not submit. Try again.");
      setSubmitting(false);
    }
  };

  const advanceFrom = (from: number) => {
    if (advancedFor.current >= from) return;
    advancedFor.current = from;
    if (from >= questions.length - 1) void send();
    else setI((prev) => (prev === from ? from + 1 : prev));
  };

  // Keep the interval's callback pointing at the latest advanceFrom WITHOUT
  // making the timer effect depend on it — depending on it would recreate the
  // timer every render. This ref indirection is why no exhaustive-deps disable
  // is needed (CLAUDE.md forbids eslint-disable).
  const advanceRef = useRef(advanceFrom);
  advanceRef.current = advanceFrom;

  useEffect(() => {
    setRemaining(secondsPerQ);
    let fired = false;
    const tick = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(tick);
          if (!fired) {
            fired = true;
            advanceRef.current(i);
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [i, secondsPerQ]);

  if (submitting)
    return (
      <Panel title="Submitting answers…">
        <Spinner label="Scoring on the server. Don't refresh." />
      </Panel>
    );

  const q = questions[i];
  if (q === undefined) return null;
  const chosen = answers[i];
  const locked = chosen !== undefined;
  const last = i === questions.length - 1;

  const pick = (oi: number) => {
    if (locked) return;
    const next = { ...answers, [i]: oi };
    setAnswers(next);
    answersRef.current = next;
    setTimeout(() => advanceFrom(i), 350);
  };

  return (
    <Panel title="Qualifying examination" sub="Closed-book. Answer from your own knowledge.">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Pill tone="gold">{q.topic}</Pill>
          {last && <Pill tone="gold">Final question</Pill>}
          <span className="font-mono text-xs text-sage">
            Q {i + 1} / {questions.length}
          </span>
        </div>
        <TimerRing remaining={remaining} total={secondsPerQ} />
      </div>

      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-paper2">
        <div
          className="h-full bg-gold transition-all"
          style={{ width: `${String(((i + 1) / questions.length) * 100)}%` }}
        />
      </div>

      <div className="mb-4 font-display text-lg font-semibold text-ink">{q.q}</div>
      <div className="grid gap-2.5">
        {q.options.map((opt, oi) => {
          const sel = chosen === oi;
          return (
            <button
              key={oi}
              type="button"
              onClick={() => pick(oi)}
              disabled={locked}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-[15px] transition ${
                sel ? "border-navy2 bg-navy/5" : "border-line bg-cream"
              } ${locked && !sel ? "opacity-50" : ""}`}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-xs ${
                  sel ? "bg-navy text-cream" : "border border-line text-ink-soft"
                }`}
              >
                {String.fromCharCode(65 + oi)}
              </span>
              {opt}
            </button>
          );
        })}
      </div>

      {submitErr !== "" && (
        <div className="mt-4">
          <ErrorNote>{submitErr}</ErrorNote>
          <Button onClick={() => void send()}>Retry submission</Button>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between text-xs text-sage">
        <span>No going back — answers lock in automatically.</span>
        <button
          type="button"
          onClick={() => advanceFrom(i)}
          disabled={locked}
          className="rounded-lg border border-line px-3 py-2 font-semibold text-ink-soft disabled:opacity-40"
        >
          Skip
        </button>
      </div>
    </Panel>
  );
}
