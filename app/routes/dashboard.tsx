import { Form } from "react-router";
import type { Route } from "./+types/dashboard";
import pool from "../db.server";
import { requireUserId } from "../session.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dashboard" },
    { name: "description", content: "Your dashboard" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const result = await pool.query(
    "SELECT username, created_at FROM users WHERE id = $1",
    [userId],
  );
  const user = result.rows[0] as { username: string; created_at: string };

  const teamResult = await pool.query(
    `SELECT c.contestant_name
     FROM teams t
     JOIN team_members tm ON tm.team_id = t.id
     JOIN contestants c ON c.id = tm.contestant_id
     WHERE t.user_id = $1
     ORDER BY c.contestant_name`,
    [userId],
  );
  const team = teamResult.rows.map((row) => row.contestant_name as string);

  return { user, team };
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { user, team } = loaderData;

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-primary">
            Welcome, {user.username}
          </h1>
          <Form method="post" action="/logout">
            <button
              type="submit"
              className="text-sm text-primary/70 hover:underline"
            >
              Log out
            </button>
          </Form>
        </div>
        <div className="rounded-xl border border-primary/40 p-4">
          <p className="text-sm text-primary/70">Member since</p>
          <p className="text-xl font-medium text-primary">
            {new Date(user.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="rounded-xl border border-primary/40 p-4">
          <p className="mb-2 text-sm text-primary/70">Your team</p>
          {team.length > 0 ? (
            <ul className="space-y-1">
              {team.map((name) => (
                <li key={name} className="text-lg text-primary">
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-lg text-primary/70">No team yet</p>
          )}
        </div>
      </div>
    </main>
  );
}
