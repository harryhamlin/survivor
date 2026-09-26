// The "/signup" route: creates a new account and immediately signs the user
// in, the same way a fresh login would.
import bcrypt from "bcryptjs";
import type { Route } from "./+types/signup";
import pool from "../db.server";
import { createUserSession } from "../session.server";
import { getOrCreateFantasyPlayer } from "../players.server";
import { SignupForm } from "../components/SignupForm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "sign up" }, { name: "description", content: "Sign up" }];
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !email || !password) {
    return { error: "All fields are required" };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  try {
    const {
      rows: [user],
    } = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [email, passwordHash, name],
    );
    // Creates the fantasy_players row eagerly (rather than waiting for the
    // dashboard's own defensive upsert) so this account shows up on "/"'s
    // public standings immediately, even before its first dashboard visit.
    await getOrCreateFantasyPlayer(user.id, { displayName: name, email });
    return createUserSession(user.id, "/dashboard");
  } catch {
    // Most likely cause: `email` collided with an existing account (it's
    // UNIQUE).
    return { error: "Email is already taken" };
  }
}

export default function Signup({ actionData }: Route.ComponentProps) {
  return <SignupForm error={actionData?.error} />;
}
