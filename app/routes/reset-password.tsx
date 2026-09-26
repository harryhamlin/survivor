// The "/reset-password/:token" route: lets someone set a new password if
// their link (from "/forgot-password") is still valid. The loader validates
// the token so an expired/already-used link shows an error immediately
// instead of a form that would just fail on submit; the action re-validates
// too, since time can pass between the two (or the link could be reused
// after already succeeding once).
import bcrypt from "bcryptjs";
import type { Route } from "./+types/reset-password";
import { passwordError, readFormData } from "../security.server";
import { limitRequest } from "../rateLimit.server";
import { logout } from "../session.server";
import {
  getUserIdForResetToken,
  resetPassword,
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
  await limitRequest(request, "reset-password", 10, 15 * 60_000);
  const formData = await readFormData(request);
  const password = String(formData.get("password") ?? "");
  const error = passwordError(password);
  if (error) return { valid: true, error };
  if (await getUserIdForResetToken(params.token) === null) return { valid: false };
  const passwordHash = await bcrypt.hash(password, 10);
  if (!await resetPassword(params.token, passwordHash)) return { valid: false };
  // Require a fresh login after revoking all previous sessions.
  return logout(request);
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
