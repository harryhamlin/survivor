import { redirect } from "react-router";
import type { Route } from "./+types/dashboard";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { TEAM_SIZE } from "../constants";
import { DashboardHeader } from "../components/DashboardHeader";
import { TeamPicker } from "../components/TeamPicker";
import { TeamRoster } from "../components/TeamRoster";

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

  const contestantsResult = await pool.query(
    "SELECT id, contestant_name FROM contestants ORDER BY contestant_name",
  );
  const contestants = contestantsResult.rows as {
    id: number;
    contestant_name: string;
  }[];

  return { user, team, contestants };
}

export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const contestantIds = [
    ...new Set(formData.getAll("contestantId").map(Number)),
  ];

  if (
    contestantIds.length !== TEAM_SIZE ||
    contestantIds.some((id) => !Number.isInteger(id))
  ) {
    return { error: `Select exactly ${TEAM_SIZE} contestants` };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const {
      rows: [team],
    } = await client.query(
      "INSERT INTO teams (user_id) VALUES ($1) RETURNING id",
      [userId],
    );
    for (const contestantId of contestantIds) {
      await client.query(
        "INSERT INTO team_members (team_id, contestant_id) VALUES ($1, $2)",
        [team.id, contestantId],
      );
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return { error: "Could not save your team. You may already have one." };
  } finally {
    client.release();
  }

  return redirect("/dashboard");
}

export default function Dashboard({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { user, team, contestants } = loaderData;

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <DashboardHeader username={user.username} />
        {team.length === 0 ? (
          <TeamPicker contestants={contestants} error={actionData?.error} />
        ) : (
          <TeamRoster createdAt={user.created_at} team={team} />
        )}
      </div>
    </main>
  );
}
