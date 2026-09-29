// The "/login" route: renders the sign-in form and, on submit, checks the
// entered credentials against the `users` table and starts a session.
import bcrypt from "bcryptjs";
import { data } from "react-router";
import { readFormData } from "../security.server";
import {
  accountKey,
  getClientIp,
  isRateLimited,
  limitRequest,
} from "../rateLimit.server";

import type { Route } from "./+types/login";
import pool from "../db.server";
import { createUserSession } from "../session.server";
import { LoginForm } from "../components/LoginForm";

// Valid cost-10 dummy hash keeps nonexistent accounts on the bcrypt path.
const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

// <title>/<meta> tags for this page.
export function meta({}: Route.MetaArgs) {
  return [{ title: "sign in" }, { name: "description", content: "Sign in" }];
}

// Runs on POST (i.e. when the login form is submitted). Looks up the
// submitted email, compares the submitted password against the stored
// bcrypt hash, and either returns an error (re-rendering the form with a
// message) or starts a session and redirects to the landing page.
export async function action({ request }: Route.ActionArgs) {
  await limitRequest(request, "login", 30, 15 * 60_000);
  const formData = await readFormData(request);
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (await isRateLimited(`login:account:${accountKey(email)}`, 10, 15 * 60_000)) {
    console.error(
      `Login rate-limited for "${email}" from ${getClientIp(request)}`,
    );
    return data({ error: "Too many attempts. Please try again later." }, {
      status: 429, headers: { "Retry-After": "900" },
    });
  }

  const result = await pool.query(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email],
  );

  const user = result.rows[0] as
    | { id: number; password_hash: string }
    | undefined;
  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

  if (!valid || !user) {
    console.error(
      `Login failed for "${email}" from ${getClientIp(request)}`,
    );
    return { error: "Invalid email or password" };
  }

  return createUserSession(user.id, "/", user.password_hash, email);
}

// The page itself is just the reusable LoginForm component, fed whatever
// error the action above returned (undefined on first load / success).
export default function Login({ actionData }: Route.ComponentProps) {
  return <LoginForm error={actionData?.error} />;
}
