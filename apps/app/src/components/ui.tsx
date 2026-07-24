import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Panel({
  title,
  sub,
  children,
}: {
  title?: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line bg-cream p-6 shadow-sm sm:p-8">
      {title !== undefined && (
        <h1 className="font-display text-2xl font-semibold text-ink">{title}</h1>
      )}
      {sub !== undefined && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
      <div className={title === undefined ? "" : "mt-6"}>{children}</div>
    </section>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none focus:border-navy2 ${props.className ?? ""}`}
    />
  );
}

export function Select({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={`w-full rounded-xl border border-line bg-white px-4 py-3 text-ink outline-none focus:border-navy2 ${rest.className ?? ""}`}
    >
      {children}
    </select>
  );
}

export function MultiSelect({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${
              on
                ? "border-navy2 bg-navy text-cream"
                : "border-line bg-white text-ink-soft hover:bg-paper2"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function Pill({
  children,
  tone = "line",
}: {
  children: ReactNode;
  tone?: "navy" | "gold" | "line";
}) {
  const tones = {
    navy: "bg-navy text-cream",
    gold: "bg-gold-soft text-ink",
    line: "border border-line text-ink-soft",
  } as const;
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mb-7 flex gap-3">
      {steps.map((label, i) => (
        <div key={label} className="flex flex-1 items-center gap-2">
          <div
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold ${
              i <= current ? "bg-navy text-cream" : "border border-line text-sage"
            }`}
          >
            {i + 1}
          </div>
          <span className={`text-sm font-semibold ${i <= current ? "text-ink" : "text-sage"}`}>
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sage" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-navy" />
      {label !== undefined && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-3 flex items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger"
      role="alert"
    >
      {children}
    </div>
  );
}
