// FWG-UltraEdge 🌍⚡ — Auth Middleware
export function validateToken(req: Request, token: string): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace("Bearer ", "").trim();
  return bearer === token;
}
