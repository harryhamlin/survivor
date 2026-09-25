import bcrypt from "bcryptjs";
import { Form } from "react-router";
import type { Route } from "./+types/login";
import pool from "../db.server";
import { createUserSession } from "../session.server";

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
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-16">
        <h1
          className="font-heading whitespace-nowrap text-center tracking-wide text-primary"
          style={{ fontSize: "clamp(1.5rem, 7vw, 2.25rem)" }}
        >
          Fantasy Survivor 51
        </h1>
        <div className="space-y-4">
          <p className="text-center text-sm text-primary/70">Sign in</p>
          <Form method="post" className="space-y-4">
            <div className="space-y-1">
              <label
                htmlFor="username"
                className="block text-sm font-medium text-primary"
              >
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                className="w-full rounded-lg border border-primary/40 bg-background px-3 py-2 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-primary"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="w-full rounded-lg border border-primary/40 bg-background px-3 py-2 text-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            {actionData?.error && (
              <p className="text-sm text-red-500">{actionData.error}</p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-black hover:opacity-90"
            >
              Log in
            </button>
          </Form>
        </div>
      </div>
    </main>
  );
}
