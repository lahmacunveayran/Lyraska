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
  // Arayüz kodu: türe duyarlı kurallar ve çekirdekle tek kapı.
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    // Satır içi `eslint-disable` yorumları kuralları susturamaz.
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" },
    rules: {
      // Beklenmeyen bir Promise'in hatası sessizce kaybolmasın.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      // Çekirdeğe giden her çağrı backend.ts'ten geçer: komut sözleşmesi denetimi (check:commands)
      // yalnızca orayı okur; başka yerden `invoke` çağrısı denetimsiz kalırdı.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@tauri-apps/api", "@tauri-apps/api/*", "@tauri-apps/plugin-*"],
              message: "Tauri API'si yalnızca src/lib/backend.ts'ten çağrılır.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/lib/backend.ts"],
    rules: { "no-restricted-imports": "off" },
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
