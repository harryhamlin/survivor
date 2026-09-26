import crypto from "node:crypto";
import pool from "./db.server";
import { hashToken, revokeUserCredentials } from "./security.server";

export async function createPasswordResetToken(userId: number, email: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock order is always user first, then tokens/sessions. Recheck the email
    // so an in-flight request cannot issue a token to a former recovery address.
    const { rows } = await client.query("SELECT id FROM users WHERE id = $1 AND email = $2 FOR UPDATE", [userId, email]);
    if (!rows.length) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
    const token = crypto.randomBytes(32).toString("hex");
    await client.query(
      "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, clock_timestamp() + interval '1 hour')",
      [userId, hashToken(token)],
    );
    await client.query("COMMIT");
    return token;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getUserIdForResetToken(token: string): Promise<number | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await pool.query(
    "SELECT user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > clock_timestamp()",
    [hashToken(token)],
  );
  return rows[0]?.user_id ?? null;
}

export async function resetPassword(token: string, passwordHash: string): Promise<boolean> {
  const userId = await getUserIdForResetToken(token);
  if (userId === null) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const { rows } = await client.query(
      `DELETE FROM password_reset_tokens
       WHERE token_hash = $1 AND user_id = $2 AND used_at IS NULL
         AND expires_at > clock_timestamp() RETURNING user_id`,
      [hashToken(token), userId],
    );
    if (!rows.length) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
    await revokeUserCredentials(client, userId);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
