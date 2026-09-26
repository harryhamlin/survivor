import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import pool from "./db.server";
import { sendEmail } from "./mailer.server";
import { hashToken, revokeUserCredentials } from "./security.server";
import { isRateLimited } from "./rateLimit.server";

export async function updateProfile(
  userId: number,
  profile: { name: string; email: string; emailNotifications: boolean; currentPassword: string },
  origin: string,
): Promise<{ error?: string; message?: string; success?: boolean }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [user] } = await client.query(
      "SELECT email, password_hash FROM users WHERE id = $1 FOR UPDATE", [userId],
    );
    if (!user) throw new Error("Account no longer exists");
    const changingEmail = profile.email !== user.email;
    if (changingEmail) {
      if (!profile.currentPassword || !await bcrypt.compare(profile.currentPassword, user.password_hash)) {
        await client.query("ROLLBACK");
        return { error: "Enter your current password to change your email" };
      }
      if (await isRateLimited(`email-change:user:${userId}`, 3, 60 * 60_000, client) ||
          await isRateLimited("email-change:email-budget", 100, 60 * 60_000, client)) {
        await client.query("ROLLBACK");
        return { error: "Too many email changes. Please try again later." };
      }
      const { rows: existing } = await client.query("SELECT id FROM users WHERE email = $1", [profile.email]);
      if (existing.length) {
        await client.query("ROLLBACK");
        return { error: "Email is already taken" };
      }
      const token = crypto.randomBytes(32).toString("hex");
      await client.query(
        `INSERT INTO email_change_tokens (user_id, token_hash, new_email, expires_at)
         VALUES ($1, $2, $3, clock_timestamp() + interval '1 hour')
         ON CONFLICT (user_id) DO UPDATE SET token_hash = EXCLUDED.token_hash,
           new_email = EXCLUDED.new_email, expires_at = EXCLUDED.expires_at`,
        [userId, hashToken(token), profile.email],
      );
      // Do not make the pending link usable unless both messages are accepted.
      // The old address remains the recovery address until confirmation.
      await sendEmail({
        to: user.email,
        subject: "Email change requested for Fantasy Survivor",
        text: `A change to ${profile.email} was requested for your account. Your current email still works until the new address is confirmed. If this was not you, reset your password at ${origin}/forgot-password to cancel the request and sign out existing sessions.`,
      });
      await sendEmail({
        to: profile.email,
        subject: "Confirm your Fantasy Survivor email",
        text: `Sign in to your existing account, then confirm your new email: ${origin}/confirm-email/${token}\n\nThis link expires in one hour.`,
      });
    }
    await client.query(
      "UPDATE users SET name = $1, email_notifications = $2 WHERE id = $3",
      [profile.name, profile.emailNotifications, userId],
    );
    await client.query("COMMIT");
    return { success: true, message: changingEmail
      ? "Check your new email to confirm the change. Your current email stays active until then."
      : "Saved." };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [user] } = await client.query("SELECT password_hash FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!user || !await bcrypt.compare(currentPassword, user.password_hash)) {
      await client.query("ROLLBACK");
      return false;
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hash, userId]);
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

export async function getPendingEmail(userId: number, token: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const { rows } = await pool.query(
    "SELECT new_email FROM email_change_tokens WHERE user_id = $1 AND token_hash = $2 AND expires_at > clock_timestamp()",
    [userId, hashToken(token)],
  );
  return rows[0]?.new_email ?? null;
}

export async function confirmEmail(userId: number, token: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    const { rows: [pending] } = await client.query(
      `DELETE FROM email_change_tokens WHERE user_id = $1 AND token_hash = $2
       AND expires_at > clock_timestamp() RETURNING new_email`,
      [userId, hashToken(token)],
    );
    if (!pending) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("UPDATE users SET email = $1 WHERE id = $2", [pending.new_email, userId]);
    await client.query("UPDATE fantasy_players SET email = $1 WHERE user_id = $2", [pending.new_email, userId]);
    await revokeUserCredentials(client, userId);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    if ((error as { code?: string }).code === "23505") return false;
    throw error;
  } finally {
    client.release();
  }
}
