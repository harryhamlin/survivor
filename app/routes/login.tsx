import bcrypt from "bcryptjs";
import type { Route } from "./+types/login";
import pool from "../db.server";
import { createUserSession } from "../session.server";
import { LoginForm } from "../components/LoginForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign In" }, { name: "description", content: "Sign in" }];
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  const result = await pool.query(
    "SELECT id, password_hash FROM users WHERE username = $1",
    [username],
  );

  const user = result.rows[0] as
    | { id: number; password_hash: string }
    | undefined;
  const valid = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!valid || !user) {
    return { error: "Invalid username or password" };
  }

  return createUserSession(user.id, "/dashboard");
}

export default function Login({ actionData }: Route.ComponentProps) {
  return <LoginForm error={actionData?.error} />;
}
