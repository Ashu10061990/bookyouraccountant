import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

/** Shared flat config for Node/TypeScript packages. */
export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true },
    },
    plugins: { import: importPlugin },
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
    files: ["**/*.config.{js,cjs,mjs}", "**/eslint.config.js", "packages/config/**/*.js"],
    ...tseslint.configs.disableTypeChecked,
  },
  { ignores: ["dist/**", ".next/**", "coverage/**", "node_modules/**"] },
);
