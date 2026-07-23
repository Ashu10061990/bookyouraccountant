import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

// eslint-import-resolver-typescript resolves a non-glob `project` entry with
// `path.resolve(process.cwd(), entry)` — i.e. relative to whatever directory
// the `eslint` process happens to be invoked from, NOT relative to this
// config file. Turbo runs each package's `lint` script with that package as
// cwd, while the root `eslint . --max-warnings=0` runs with the repo root as
// cwd, so a repo-root-relative string like `"tsconfig.base.json"` resolves
// correctly from the root but silently misses from inside a package — and
// once it misses, get-tsconfig falls back to searching upward for the
// nearest `tsconfig.json` by name, which lands on that package's own
// tsconfig.json. That file `extends` the scoped `@bya/config` package, and
// get-tsconfig (in this version) resolves scoped-package `extends` targets
// through the literal `node_modules/@bya/config` symlink path rather than
// its realpath — one directory level short of the real `packages/config`
// location — so the further relative `extends: "../../../tsconfig.base.json"`
// inside `packages/config/typescript/base.json` then fails with
// `File '../../../tsconfig.base.json' not found.` regardless of which
// package triggered it. Passing an absolute path sidesteps `process.cwd()`
// entirely (`path.resolve` returns an absolute input unchanged), so the
// resolver always finds and parses this extends-free root tsconfig
// directly, no matter where `eslint` is invoked from.
const repoRootTsconfig = fileURLToPath(new URL("../../../tsconfig.base.json", import.meta.url));

/** Shared flat config for Node/TypeScript packages. */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        // Every package's tsconfig.json now `include`s its test files, so the
        // project service finds them and type-aware linting just works. Build
        // output stays test-free via a separate `tsconfig.build.json` that the
        // `build` script points at.
        //
        // This replaces an `allowDefaultProject` allowlist of exact test paths.
        // That option takes no wildcards, so every new test file needed two
        // hand-written entries (package-relative and repo-root-relative) and
        // was otherwise one omission away from a lint crash. Worse, listing a
        // file that IS in a project is itself an error — so the list could not
        // simply be over-broad "just in case". Including tests in the project
        // removes the list and the failure mode together.
        projectService: true,
      },
    },
    plugins: { import: importPlugin },
    settings: {
      // Without this, eslint-plugin-import falls back to its default (JS-only)
      // parser to build the export map it needs for cross-file rules like
      // `import/no-cycle`. That parse silently fails on TypeScript syntax, so
      // the rule treats every `.ts`/`.tsx` file as unresolvable and never
      // actually traverses anything — it looks "on" but never fires.
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },
      "import/resolver": {
        typescript: { alwaysTryTypes: true, project: [repoRootTsconfig] },
      },
    },
    rules: {
      // --- Spec §8: a caught error is handled, rethrown, or logged. Never swallowed.
      "no-empty": ["error", { allowEmptyCatch: false }],
      // `no-empty` deliberately treats a comment-only block as non-empty, so it
      // misses the commonest swallow of all: `catch { /* ignore */ }`. Comments
      // are not AST body nodes, so this selector catches what `no-empty` cannot.
      "no-restricted-syntax": [
        "error",
        {
          selector: "CatchClause > BlockStatement[body.length=0]",
          message:
            "Empty catch block. Handle the error, rethrow it, or log it explicitly (logger.warn).",
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      // --- Spec §9: strict typing
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",

      // --- Correctness
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "import/no-cycle": "error",
      "import/no-duplicates": "error",
    },
  },
  {
    // Tests may use console freely and assert on non-null values.
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    // Config files belong to no tsconfig, so `projectService` cannot resolve
    // them and type-aware rules must be off for them. Scoped deliberately: a
    // bare `**/*.js` glob would silently exempt real code from the type-aware
    // rules too.
    files: ["**/*.config.{js,cjs,mjs,ts}", "**/eslint.config.js", "packages/config/**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
  // Globs must be **-prefixed: a bare `dist/**` matches only a top-level dist/,
  // leaving apps/*/dist and packages/*/dist to be linted as if they were source.
  // next-env.d.ts is generated by Next and says "should not be edited"; it uses
  // triple-slash references, so it must be ignored HERE rather than in apps/web
  // alone — otherwise root-level eslint and per-package eslint disagree.
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/node_modules/**",
      "**/next-env.d.ts",
    ],
  },
);
