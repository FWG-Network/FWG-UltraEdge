// FWG-UltraEdge 🌍⚡ — Rate Limit Middleware
export async function checkRateLimit(kv: KVNamespace, ip: string, limit = 100): Promise<boolean> {
  const key = `rate:${ip}`;
  const count = parseInt((await kv.get(key)) ?? "0");
  if (count >= limit) return false;
  await kv.put(key, String(count + 1), { expirationTtl: 60 });
  return true;
}
