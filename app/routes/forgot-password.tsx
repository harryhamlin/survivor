// Password recovery returns the same response for unknown and suppressed accounts.
import { readFormData, validEmail } from "../security.server";
import { accountKey, isRateLimited, limitRequest } from "../rateLimit.server";
import type { Route } from "./+types/forgot-password";
import pool from "../db.server";
import { createPasswordResetToken } from "../passwordReset.server";
import { sendEmail } from "../mailer.server";
import { getTrustedOrigin } from "../trustedOrigin.server";
import { ForgotPasswordForm } from "../components/ForgotPasswordForm";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "reset password" },
    { name: "description", content: "Reset your password" },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  await limitRequest(request, "forgot-password", 10, 15 * 60_000);
  const formData = await readFormData(request);
  const email = String(formData.get("email") ?? "").trim();

  if (!validEmail(email)) return { sent: true };
  // Suppress repeats without revealing whether an account exists. The global
  // budget also caps provider spend when an attacker rotates IPs and accounts.
  if (await isRateLimited(`reset:cooldown:${accountKey(email)}`, 1, 60_000) ||
      await isRateLimited(`reset:account:${accountKey(email)}`, 3, 60 * 60_000) ||
      await isRateLimited("reset:email-budget", 100, 60 * 60_000)) {
    return { sent: true };
  }

  const result = await pool.query("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  const user = result.rows[0] as { id: number } | undefined;

  if (user) {
    const token = await createPasswordResetToken(user.id, email);
    if (!token) return { sent: true };
    // getTrustedOrigin (rather than trusting the request's Host header
    // directly) is what keeps this link pointing at our own domain even if
    // a request ever reaches the app with a spoofed Host.
    const resetLink = `${getTrustedOrigin(request)}/reset-password/${token}`;
    await sendEmail({
      to: email,
      subject: "reset your fantasy survivor password",
      text: `did u forget ur password? \n\nreset: ${resetLink}\n\n`,
    });
  }

  return { sent: true };
}

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  return <ForgotPasswordForm sent={actionData?.sent ?? false} />;
}
