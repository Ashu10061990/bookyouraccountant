import base from "@bya/config/eslint/base";

export default [
  ...base,
  { ignores: ["apps/**", "packages/**"] }, // each workspace lints itself
];
