import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist/", "node_modules/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: "./tsconfig.app.json",
      },
    },
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      "react-hooks": react,
    },
    rules: {
      ...react.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: "./tsconfig.node.json",
      },
    },
    files: ["vite.config.ts"],
  },
];
