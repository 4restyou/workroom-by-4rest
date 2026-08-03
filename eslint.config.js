import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "supabase", ".claude"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // <button>의 HTML 기본값은 submit이다. 폼 안에서 type을 빠뜨리면 클릭이
      // 의도치 않게 폼을 제출한다(예약 위저드처럼 form 기반 화면에서 실제 사고로
      // 이어진다). 항상 명시하게 강제한다.
      "react/button-has-type": "error",
    },
  },
  // Build / tooling config files run in Node.
  {
    files: ["*.config.{ts,js}", "vite.config.ts", "vitest.config.ts"],
    languageOptions: { globals: { ...globals.node } },
  },
);
