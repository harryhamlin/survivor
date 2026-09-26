// The "/forgot-password" route: looks up the submitted email and, if it
// matches an account, emails a password reset link. The response is
// identical either way (see ForgotPasswordForm) so this can't be used to
// discover which emails have accounts — only the actual email-sending step
// is skipped for a non-match.
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
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();

  const result = await pool.query("SELECT id FROM users WHERE email = $1", [
    email,
  ]);
  const user = result.rows[0] as { id: number } | undefined;

  if (user) {
    const token = await createPasswordResetToken(user.id);
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
