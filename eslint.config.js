// This config must cover EVERY file in the workspace. `lint-staged` runs ESLint
// from the repo root against staged paths, so anything ignored here silently
// escapes the pre-commit gate — and a path that is ignored rather than clean
// makes ESLint emit a warning, which `--max-warnings=0` turns into a hard
// failure. Uses the react preset because it already extends base and layers
// React rules onto .tsx/.jsx only.
import react from "@bya/config/eslint/react";

export default react;
