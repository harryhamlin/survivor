// The "/account" route: lets a logged-in player update their profile info
// (name, email, username) or change their password. Two independent forms
// posting to this same route, distinguished by a hidden `intent` field —
// same pattern as the dashboard route's draft-picker/weekly-picks forms.
import bcrypt from "bcryptjs";
import type { Route } from "./+types/account";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { TopBanner } from "../components/TopBanner";
import { AccountForm } from "../components/AccountForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "account" }, { name: "description", content: "Your account" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const result = await pool.query(
    "SELECT username, name, email FROM users WHERE id = $1",
    [userId],
  );
  const user = result.rows[0] as {
    username: string;
    name: string | null;
    email: string | null;
  };
  return { user };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "change-password") {
    return changePasswordAction(userId, formData);
  }
  return updateProfileAction(userId, formData);
}

async function updateProfileAction(userId: number, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();

  if (!name || !email || !username) {
    return {
      intent: "update-profile" as const,
      error: "All fields are required",
    };
  }

  try {
    await pool.query(
      "UPDATE users SET name = $1, email = $2, username = $3 WHERE id = $4",
      [name, email, username, userId],
    );
  } catch {
    // Most likely cause: `username` or `email` collided with another
    // account (both columns are UNIQUE) — same reasoning as signup.tsx.
    return {
      intent: "update-profile" as const,
      error: "Username or email is already taken",
    };
  }

  return { intent: "update-profile" as const, success: true };
}

async function changePasswordAction(userId: number, formData: FormData) {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  const {
    rows: [{ password_hash: passwordHash }],
  } = await pool.query("SELECT password_hash FROM users WHERE id = $1", [
    userId,
  ]);

  const currentPasswordValid = await bcrypt.compare(
    currentPassword,
    passwordHash,
  );
  if (!currentPasswordValid) {
    return {
      intent: "change-password" as const,
      error: "Current password is incorrect",
    };
  }
  if (newPassword.length < 8) {
    return {
      intent: "change-password" as const,
      error: "New password must be at least 8 characters",
    };
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10);
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [
    newPasswordHash,
    userId,
  ]);

  return { intent: "change-password" as const, success: true };
}

export default function Account({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  return (
    <main className="min-h-screen bg-background">
      <TopBanner username={loaderData.user.username} page="account" />
      <div className="mx-auto max-w-sm space-y-8 px-4 py-12">
        <AccountForm user={loaderData.user} actionData={actionData} />
      </div>
    </main>
  );
}
