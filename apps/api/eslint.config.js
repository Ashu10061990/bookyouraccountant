// See the note in packages/shared/eslint.config.js — the react preset is base
// plus .tsx-only rules, so it is identical here and keeps every package's lint
// behaviour in step with the root config used by pre-commit.
import react from "@bya/config/eslint/react";
export default react;
