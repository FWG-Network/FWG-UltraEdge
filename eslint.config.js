export default [
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
      }
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
    }
  }
];
