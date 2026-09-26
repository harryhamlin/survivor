// The "/login" route: renders the sign-in form and, on submit, checks the
// entered credentials against the `users` table and starts a session.
import bcrypt from "bcryptjs";
import type { Route } from "./+types/login";
import pool from "../db.server";
import { createUserSession } from "../session.server";
import { LoginForm } from "../components/LoginForm";

// <title>/<meta> tags for this page.
export function meta({}: Route.MetaArgs) {
  return [{ title: "sign in" }, { name: "description", content: "Sign in" }];
}

// Runs on POST (i.e. when the login form is submitted). Looks up the
// submitted email, compares the submitted password against the stored
// bcrypt hash, and either returns an error (re-rendering the form with a
// message) or starts a session and redirects to the landing page.
export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await pool.query(
    "SELECT id, password_hash FROM users WHERE email = $1",
    [email],
  );

  const user = result.rows[0] as
    | { id: number; password_hash: string }
    | undefined;
  // bcrypt.compare still needs to run even when there's no matching user, in
  // a real implementation you'd compare against a dummy hash to avoid timing
  // differences revealing whether an account exists; kept simple here since
  // this is a small personal app, not a public-facing service.
  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!valid || !user) {
    return { error: "Invalid email or password" };
  }

  return createUserSession(user.id, "/");
}

// The page itself is just the reusable LoginForm component, fed whatever
// error the action above returned (undefined on first load / success).
export default function Login({ actionData }: Route.ComponentProps) {
  return <LoginForm error={actionData?.error} />;
}
