// FWG-UltraEdge 🌍⚡ — Restream Provider
export async function notifyRestream(apiKey: string, title: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.restream.io/v2/user/channel-settings", {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
