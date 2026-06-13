import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    ignores: ["cinema-worker/"],  // ← ADD
  },
  {
    files: ["src/index.ts", "src/highbanwidth.js", "src/cinematic-hub.js"], 
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
