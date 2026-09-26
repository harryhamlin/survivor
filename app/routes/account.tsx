// The "/account" route: lets a logged-in player update their profile info
// (name, email) or change their password. Two independent forms posting to
// this same route, distinguished by a hidden `intent` field — same pattern
// as the dashboard route's draft-picker/weekly-picks forms.
import { data } from "react-router";
import { updateProfile, changePassword } from "../accountSecurity.server";
import { passwordError, readFormData, validEmail } from "../security.server";
import { isRateLimited, limitRequest } from "../rateLimit.server";
import { getTrustedOrigin } from "../trustedOrigin.server";
import type { Route } from "./+types/account";
import pool from "../db.server";
import { requireUserId, logout } from "../session.server";
import { TopBanner } from "../components/TopBanner";
import { AccountForm } from "../components/AccountForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "account" }, { name: "description", content: "Your account" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const result = await pool.query(
    "SELECT name, email, email_notifications FROM users WHERE id = $1",
    [userId],
  );
  const row = result.rows[0] as {
    name: string | null;
    email: string;
    email_notifications: boolean;
  };
  const user = {
    name: row.name,
    email: row.email,
    emailNotifications: row.email_notifications,
  };
  return { user };
}

export async function action({ request }: Route.ActionArgs) {
  await limitRequest(request, "account", 20, 15 * 60_000);
  const userId = await requireUserId(request);
  const formData = await readFormData(request);
  const intent = formData.get("intent") === "change-password"
    ? "change-password" as const
    : "update-profile" as const;
  if (await isRateLimited(`account:user:${userId}`, 10, 15 * 60_000)) {
    return data({ intent, error: "Too many attempts. Please try again later." }, {
      status: 429, headers: { "Retry-After": "900" },
    });
  }
  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (intent === "change-password") {
    const newPassword = String(formData.get("newPassword") ?? "");
    const error = passwordError(newPassword);
    if (error) return { intent, error };
    if (!await changePassword(userId, currentPassword, newPassword)) {
      return { intent, error: "Current password is incorrect" };
    }
    return logout(request);
  }
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!name || name.length > 100 || !validEmail(email)) {
    return { intent, error: "Enter a valid email and a name of at most 100 characters" };
  }
  try {
    return { intent, ...await updateProfile(userId, {
      name, email, currentPassword,
      emailNotifications: formData.get("emailNotifications") === "on",
    }, getTrustedOrigin(request)) };
  } catch {
    return { intent, error: "Could not save your changes. Please try again later." };
  }
}

export default function Account({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-background">
      <TopBanner
        displayName={loaderData.user.name ?? loaderData.user.email}
        page="account"
      />
      <div className="mx-auto max-w-sm space-y-8 px-4 py-12">
        <AccountForm user={loaderData.user} actionData={actionData} />
      </div>
    </main>
  );
}
