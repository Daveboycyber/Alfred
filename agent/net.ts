/**
 * The caller's address for rate limiting. The first X-Forwarded-For entry is
 * whatever the client sent, so it can be rotated to dodge the limit. Prefer the
 * address Fly's proxy sets, then the entry our own proxy appended (the last).
 */
export function clientIp(req: { headers: Record<string, string | string[] | undefined>; socket: { remoteAddress?: string } }): string {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[v.length - 1] : v)?.trim();
  const fly = one(req.headers["fly-client-ip"]);
  if (fly) return fly;
  const xff = one(req.headers["x-forwarded-for"])?.split(",").map(s => s.trim()).filter(Boolean);
  if (xff?.length) return xff[xff.length - 1];
  return req.socket.remoteAddress || "unknown";
}
