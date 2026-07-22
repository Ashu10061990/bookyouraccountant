// Use the react preset even though this package has no .tsx: it is base plus
// rules scoped to .tsx/.jsx only, so behaviour here is identical to base — but
// it guarantees this package and the root config can never disagree about the
// same file, which is what pre-commit (root) vs `pnpm lint` (per-package) would
// otherwise risk.
import react from "@bya/config/eslint/react";
export default react;
