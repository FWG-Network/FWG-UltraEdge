module.exports = {
  overrides: [
    {
      files: ["**/handlers/proxy.js"],
      globals: {
        shExpMatch: "readonly",
        FindProxyForURL: "readonly",
      }
    }
  ]
}
