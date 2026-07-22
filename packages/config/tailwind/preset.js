/** Shared Tailwind preset. Brand tokens carried forward from the legacy app. */
export default {
  theme: {
    extend: {
      colors: {
        paper: "#F6F3EC",
        paper2: "#ECE7DA",
        ink: "#0F1E13",
        "ink-soft": "#3F5446",
        navy: "#142719",
        navy2: "#306339",
        sage: "#8FA596",
        gold: "#E9A23B",
        "gold-soft": "#F3DDB0",
        line: "#E7E1D2",
        cream: "#FBF9F4",
        danger: "#C0492F",
      },
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        body: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
};
