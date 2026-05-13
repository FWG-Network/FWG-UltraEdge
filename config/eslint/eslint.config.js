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
    }
  },
  // ... config ដែលមានស្រាប់
]
