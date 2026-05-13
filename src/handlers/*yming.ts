// ប្រកាសឱ្យ TypeScript ស្គាល់ shExpMatch
declare function shExpMatch(str: string, shexp: string): boolean;

export const handleProxy = (req: any) => {
    // កូដ PAC Script សម្រាប់ឱ្យ Browser ប្រើ
    const pacScript = `
        function FindProxyForURL(url, host) {
            // បើជា YouTube ឬវេបសាយវីដេអូ ឱ្យប្រើ Direct ឬ Proxy ល្បឿនលឿនបំផុត
            if (shExpMatch(host, "*.googlevideo.com") || shExpMatch(host, "*.youtube.com")) {
                return "DIRECT"; // ឬ "PROXY your-fast-proxy:port"
            }
            return "DIRECT";
        }
    `;
    // ២. ក្រុមដែលចង់ឱ្យដើរតាម Proxy (សម្រាប់បិទ Ads ឬ Target តំបន់)
  // ប្រសិនបើចង់ឱ្យអ្វីៗផ្សេងទៀតដើរតាម Proxy ទាំងអស់
  return proxy;
}`;
