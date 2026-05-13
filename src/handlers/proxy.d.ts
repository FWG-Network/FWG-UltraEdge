export {};

declare global {
  function FindProxyForURL(url: string, host: string): string;
  function shExpMatch(str: string, pattern: string): boolean;
  function dnsDomainIs(host: string, domain: string): boolean;
  function dnsResolve(host: string): string;
  function isInNet(host: string, pattern: string, mask: string): boolean;
  function myIpAddress(): string;
}
