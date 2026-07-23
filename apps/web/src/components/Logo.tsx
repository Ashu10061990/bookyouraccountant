/** The BYA "K" mark — ported verbatim from the legacy MarketingLayout. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <rect x="2" y="3" width="34" height="34" rx="8" fill="#306339" />
      <rect x="11" y="11" width="4.6" height="19" rx="1" fill="#FFFFFF" />
      <path d="M16 20 L26 10 L29.5 12.5 L19.5 21 Z" fill="#E9A23B" />
      <path d="M16 20 L25.5 29.5 L22 31.5 L14.5 23 Z" fill="#FFFFFF" />
      <circle cx="26.5" cy="29" r="2.4" fill="none" stroke="#E9A23B" strokeWidth="1.6" />
      <path
        d="M30 8 H33 V11"
        stroke="#E9A23B"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
