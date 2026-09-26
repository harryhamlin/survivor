import type { PoolClient } from "pg";
import { isIP } from "node:net";
import pool from "./db.server";
import { hashToken } from "./security.server";

let nextCleanup = 0;

export async function isRateLimited(key: string, limit: number, windowMs: number, client?: PoolClient): Promise<boolean> {
  // Bounded counters, expiring rows and atomic updates are shared across dynos.
  // Storage failures fail closed instead of silently allowing unlimited traffic.
  if (!client && Date.now() >= nextCleanup) {
    nextCleanup = Date.now() + 60_000;
    await pool.query("DELETE FROM rate_limits WHERE expires_at <= now()");
  }
  const { rows } = await (client ?? pool).query(
    `INSERT INTO rate_limits (key_hash, hits, expires_at)
     VALUES ($1, 1, clock_timestamp() + $3 * interval '1 millisecond')
     ON CONFLICT (key_hash) DO UPDATE SET
       hits = CASE WHEN rate_limits.expires_at <= clock_timestamp() THEN 1
                   ELSE LEAST(rate_limits.hits + 1, $2 + 1) END,
       expires_at = CASE WHEN rate_limits.expires_at <= clock_timestamp()
                        THEN clock_timestamp() + $3 * interval '1 millisecond'
                        ELSE rate_limits.expires_at END
     RETURNING hits`,
    [hashToken(key), limit, windowMs],
  );
  return rows[0].hits > limit;
}

export function getClientIp(request: Request): string {
  // Heroku appends the connecting peer on the RIGHT. Only trust this header
  // there; other deployments share a conservative bucket until configured.
  if (!process.env.DYNO) return "unknown";
  const ip = request.headers.get("X-Forwarded-For")?.split(",").at(-1)?.trim();
  if (!ip || !isIP(ip)) return "unknown";
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
}

export async function limitRequest(request: Request, scope: string, limit: number, windowMs: number) {
  if (await isRateLimited(`${scope}:ip:${getClientIp(request)}`, limit, windowMs)) {
    throw new Response("Too many attempts. Please try again later.", {
      status: 429,
      statusText: "Too many attempts. Please try again later.",
      headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) },
    });
  }
}

export function accountKey(email: string): string {
  return email.trim().toLowerCase();
}
