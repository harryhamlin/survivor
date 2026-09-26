import "dotenv/config";
import crypto from "node:crypto";
import { createCookieSessionStorage, redirect } from "react-router";
import pool from "./db.server";
import { hashToken } from "./security.server";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) throw new Error("SESSION_SECRET must be set");

const SESSION_SECONDS = 7 * 24 * 60 * 60;
const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: [sessionSecret],
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_SECONDS,
  },
});

// Recheck the authenticated hash under a lock so a concurrent password change
// cannot be followed by a session issued for the old credentials.
export async function createUserSession(
  userId: number,
  redirectTo: string,
  authenticatedPasswordHash: string,
  authenticatedEmail: string,
) {
  const token = crypto.randomBytes(32).toString("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id FROM users WHERE id = $1 AND password_hash = $2 AND email = $3 FOR UPDATE",
      [userId, authenticatedPasswordHash, authenticatedEmail],
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return redirect("/login");
    }
    await client.query("DELETE FROM user_sessions WHERE user_id = $1 AND expires_at <= now()", [userId]);
    await client.query(
      "INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + $3 * interval '1 second')",
      [hashToken(token), userId, SESSION_SECONDS],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  const session = await sessionStorage.getSession();
  session.set("token", token);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}

async function getToken(request: Request): Promise<string | null> {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const token = session.get("token");
  // Legacy cookies containing only userId deliberately no longer authenticate.
  return typeof token === "string" && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export async function getUserId(request: Request): Promise<number | null> {
  const token = await getToken(request);
  if (!token) return null;
  const { rows } = await pool.query(
    "SELECT user_id FROM user_sessions WHERE token_hash = $1 AND expires_at > now()",
    [hashToken(token)],
  );
  return rows[0]?.user_id ?? null;
}

export async function requireUserId(request: Request) {
  const userId = await getUserId(request);
  if (userId === null) throw redirect("/login");
  return userId;
}

export async function logout(request: Request) {
  const token = await getToken(request);
  if (token) await pool.query("DELETE FROM user_sessions WHERE token_hash = $1", [hashToken(token)]);
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return redirect("/login", {
    headers: { "Set-Cookie": await sessionStorage.destroySession(session) },
  });
}
