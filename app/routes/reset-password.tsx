// The "/reset-password/:token" route: lets someone set a new password if
// their link (from "/forgot-password") is still valid. The loader validates
// the token so an expired/already-used link shows an error immediately
// instead of a form that would just fail on submit; the action re-validates
// too, since time can pass between the two (or the link could be reused
// after already succeeding once).
import bcrypt from "bcryptjs";
import type { Route } from "./+types/reset-password";
import pool from "../db.server";
import { createUserSession } from "../session.server";
import {
  getUserIdForResetToken,
  markPasswordResetTokenUsed,
} from "../passwordReset.server";
import { ResetPasswordForm } from "../components/ResetPasswordForm";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "reset password" },
    { name: "description", content: "Choose a new password" },
  ];
}

export async function loader({ params }: Route.LoaderArgs) {
  const userId = await getUserIdForResetToken(params.token);
  return { valid: userId !== null };
}

export async function action({ request, params }: Route.ActionArgs) {
  const userId = await getUserIdForResetToken(params.token);
  if (userId === null) {
    return { valid: false };
  }

  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { valid: true, error: "Password must be at least 8 characters" };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
    passwordHash,
    userId,
  ]);
  await markPasswordResetTokenUsed(params.token);

  // Signs them straight in, the same way completing signup does, rather
  // than sending them back to /login to re-type the password they just
  // chose.
  return createUserSession(userId, "/dashboard");
}

export default function ResetPassword({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <ResetPasswordForm
      valid={actionData?.valid ?? loaderData.valid}
      error={actionData?.error}
    />
  );
}
