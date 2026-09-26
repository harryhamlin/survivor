// Creating, validating, and consuming password-reset tokens — kept out of
// db/schema.sql per this app's convention of putting logic in the backend,
// not the schema (see db/schema.sql's comment on password_reset_tokens).
import crypto from "node:crypto";
import pool from "./db.server";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// A random token is already high-entropy, so a fast hash (unlike bcrypt for
// passwords, which deliberately needs to be slow to resist brute-forcing a
// low-entropy human password) is enough to keep the plaintext out of the
// database while still letting lookups use a simple equality match.
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// Issues a fresh reset token for this user and returns the plaintext (only
// its hash is stored — see the comment on password_reset_tokens in
// db/schema.sql) for the caller to build an email link from. Deletes the
// user's other still-unused tokens first, so requesting a new link
// invalidates any older one instead of leaving multiple valid links around.
export async function createPasswordResetToken(
  userId: number,
): Promise<string> {
  await pool.query(
    "DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL",
    [userId],
  );
  const token = crypto.randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, hashToken(token), new Date(Date.now() + TOKEN_TTL_MS)],
  );
  return token;
}

// The user id a still-valid (unused, unexpired) token belongs to, or null.
// Doesn't consume the token — call markPasswordResetTokenUsed once the new
// password is actually saved, so a token that fails some other validation
// (e.g. a too-short password) can still be retried with the same link.
export async function getUserIdForResetToken(
  token: string,
): Promise<number | null> {
  const { rows } = await pool.query(
    `SELECT user_id FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
    [hashToken(token)],
  );
  return rows[0]?.user_id ?? null;
}

export async function markPasswordResetTokenUsed(token: string): Promise<void> {
  await pool.query(
    "UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = $1",
    [hashToken(token)],
  );
}
