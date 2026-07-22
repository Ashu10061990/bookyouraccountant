/** Brand tokens, mirroring the Tailwind preset in @bya/config. */
export const COLORS = Object.freeze({
  paper: "#F6F3EC",
  paper2: "#ECE7DA",
  ink: "#0F1E13",
  inkSoft: "#3F5446",
  navy: "#142719",
  navy2: "#306339",
  sage: "#8FA596",
  gold: "#E9A23B",
  goldSoft: "#F3DDB0",
  line: "#E7E1D2",
  cream: "#FBF9F4",
  danger: "#C0492F",
} as const);

export const FONTS = Object.freeze({
  display: "'Space Grotesk', system-ui, sans-serif",
  body: "'Plus Jakarta Sans', system-ui, sans-serif",
  mono: "'JetBrains Mono', monospace",
} as const);
