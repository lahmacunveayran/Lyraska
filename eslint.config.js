import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "src-tauri",
      "node_modules",
      "coverage",
      "src/lib/bindings",
      // Denetim kanıtları ve araştırma betikleri: olduğu gibi saklanır, programın parçası değil.
      "docs",
    ],
  },
  {
    files: ["**/*.{ts,tsx,js}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  // Kalite kapılarının kendisi (scripts/): Node betikleri, aynı kurallarla.
  {
    files: ["scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: globals.node,
    },
  },
  // Sahne denetimi: bir kısmı tarayıcıda (page.evaluate) çalışır.
  {
    files: ["scripts/check-scenes.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
