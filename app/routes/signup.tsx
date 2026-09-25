// The "/signup" route: creates a new account and immediately signs the user
// in, the same way a fresh login would.
import bcrypt from "bcryptjs";
import type { Route } from "./+types/signup";
import pool from "../db.server";
import { createUserSession } from "../session.server";
import { SignupForm } from "../components/SignupForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Sign Up" }, { name: "description", content: "Sign up" }];
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !username || !password) {
    return { error: "All fields are required" };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const {
      rows: [user],
    } = await pool.query(
      `INSERT INTO users (username, password_hash, email, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [username, passwordHash, email, name],
    );
    return createUserSession(user.id, "/dashboard");
  } catch {
    // Most likely cause: `username` or `email` collided with an existing
    // account (both columns are UNIQUE) — Postgres doesn't say which without
    // parsing the error further, so a single generic message covers both.
    return { error: "Username or email is already taken" };
  }
}

export default function Signup({ actionData }: Route.ComponentProps) {
  return <SignupForm error={actionData?.error} />;
}
