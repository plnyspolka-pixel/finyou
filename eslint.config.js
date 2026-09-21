import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".vinxi",
      // Pliki generowane — nie formatujemy ich ręcznie, kolejna regeneracja
      // i tak nadpisałaby zmiany (typy Supabase to ~8,7 tys. „błędów" prettiera).
      "src/integrations/supabase/types.ts",
      "src/routeTree.gen.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Wygenerowane typy Supabase nie nadążają za migracjami, więc kod
      // celowo rzutuje na `any` (wzorzec `loose(...)`). Zostaje jako
      // ostrzeżenie: widoczne w raporcie, ale nie blokuje lintu.
      "@typescript-eslint/no-explicit-any": "warn",
      // `try { sessionStorage… } catch {}` to świadomy wzorzec w całym UI.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  eslintPluginPrettier,
);
