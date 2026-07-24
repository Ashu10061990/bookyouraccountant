export function TimerRing({ remaining, total }: { remaining: number; total: number }) {
  const r = 23;
  const circumference = 2 * Math.PI * r;
  const frac = total === 0 ? 0 : remaining / total;
  const low = remaining <= 5;
  return (
    <div className="relative h-14 w-14" title="Seconds remaining">
      <svg width={54} height={54} className="-rotate-90">
        <circle cx={27} cy={27} r={r} fill="none" stroke="#E7E1D2" strokeWidth={4} />
        <circle
          cx={27}
          cy={27}
          r={r}
          fill="none"
          stroke={low ? "#C0492F" : "#142719"}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={(1 - frac) * circumference}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s linear, stroke .2s" }}
        />
      </svg>
      <div
        className={`absolute inset-0 grid place-items-center font-mono text-sm font-bold ${
          low ? "text-danger" : "text-navy"
        }`}
      >
        {remaining}
      </div>
    </div>
  );
}
