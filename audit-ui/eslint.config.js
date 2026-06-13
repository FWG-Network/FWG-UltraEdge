import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["cinema-worker/src"],  // ← ADD
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
  },
  {
    files: ["**/handlers/proxy.js"],
    languageOptions: {
      globals: {
        shExpMatch: "readonly",
        FindProxyForURL: "readonly",
        dnsDomainIs: "readonly",
        dnsResolve: "readonly",
        isInNet: "readonly",
        myIpAddress: "readonly",
      },
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
];
