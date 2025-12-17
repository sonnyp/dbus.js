import { defineConfig } from "eslint/config";
import markdown from "eslint-plugin-markdown";
import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});

export default defineConfig([
  {
    extends: compat.extends("eslint:recommended", "prettier"),

    plugins: {
      markdown
    },

    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.mocha
      },

      ecmaVersion: 2025,
      sourceType: "commonjs"
    },

    rules: {
      "no-constant-condition": [
        "error",
        {
          checkLoops: false
        }
      ],

      eqeqeq: ["error", "always"],
      "no-console": "off",
      "no-empty": "off"
    }
  }
]);
