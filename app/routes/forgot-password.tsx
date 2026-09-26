// The "/forgot-password" route: looks up the submitted email and, if it
// matches an account, emails a password reset link. The response is
// identical either way (see ForgotPasswordForm) so this can't be used to
// discover which emails have accounts — only the actual email-sending step
// is skipped for a non-match.
import type { Route } from "./+types/forgot-password";
import pool from "../db.server";
import { createPasswordResetToken } from "../passwordReset.server";
import { sendEmail } from "../mailer.server";
import { ForgotPasswordForm } from "../components/ForgotPasswordForm";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "reset password" },
    { name: "description", content: "Reset your password" },
  ];
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();

  const result = await pool.query("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  const user = result.rows[0] as { id: number } | undefined;

  if (user) {
    const token = await createPasswordResetToken(user.id);
    // Built from the request's own origin (rather than a separate env var)
    // so the link is correct in both local dev and on Heroku without
    // needing to keep a base-URL setting in sync.
    const resetLink = `${new URL(request.url).origin}/reset-password/${token}`;
    await sendEmail({
      to: email,
      subject: "Reset your Fantasy Survivor password",
      text: `Someone requested a password reset for your Fantasy Survivor account.\n\nReset your password: ${resetLink}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
    });
  }

  return { sent: true };
}

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  return <ForgotPasswordForm sent={actionData?.sent ?? false} />;
}
