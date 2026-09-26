// A simple in-memory sliding-window rate limiter, keyed by whatever string
// the caller passes in (e.g. a client IP). Good enough to blunt scripted
// abuse of a low-stakes public endpoint without standing up a shared store —
// it resets on dyno restart and isn't shared across multiple dynos, which is
// an acceptable tradeoff here (see app/routes/report-bug.tsx), not something
// this should be reused for anything higher-stakes without revisiting.
const hits = new Map<string, number[]>();

export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const recentHits = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recentHits.push(now);
  hits.set(key, recentHits);
  return recentHits.length > limit;
}

// Heroku's router sets X-Forwarded-For; the first entry is the original
// client (later entries, if any, are intermediate proxies).
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("X-Forwarded-For");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}
