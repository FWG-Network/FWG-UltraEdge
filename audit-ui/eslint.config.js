import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["cinema-worker/src"],  // ← ADD
  },
  {
    files: ["cinema-worker/src/index.ts", "cinema-worker/src/highbanwidth.js", "cinema-worker/src/cinematic-hub.js"], 
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
