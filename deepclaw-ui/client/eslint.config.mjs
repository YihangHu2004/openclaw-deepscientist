import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // setState inside effects is a legitimate pattern for async data loading
      'react-hooks/set-state-in-effect':  'off',
      // Unused disable directives from previous fixes
      'reportUnusedDisableDirectives':     'off',
    },
  },
]);

export default eslintConfig;
