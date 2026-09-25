// The "/dashboard" route: the main page a logged-in user sees. Shows either
// a picker to build their team of contestants (if they haven't yet) or their
// saved team roster.
import { redirect } from "react-router";
import type { Route } from "./+types/dashboard";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { TEAM_SIZE } from "../constants";
import { DashboardHeader } from "../components/DashboardHeader";
import { TeamPicker } from "../components/TeamPicker";
import { TeamRoster } from "../components/TeamRoster";
import { ScoringMetricsModal } from "../components/ScoringMetricsModal";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dashboard" },
    { name: "description", content: "Your dashboard" },
  ];
}

// Loads everything the page needs to render. Runs on every GET to
// /dashboard (including right after the team-picker action redirects back
// here).
export async function loader({ request }: Route.LoaderArgs) {
  // Bounces to /login if there's no active session.
  const userId = await requireUserId(request);

  const result = await pool.query(
    "SELECT username, created_at FROM users WHERE id = $1",
    [userId],
  );
  const user = result.rows[0] as { username: string; created_at: string };

  // The user's team, if they've already picked one (joins teams ->
  // team_members -> contestants to get the actual names, not just ids).
  const teamResult = await pool.query(
    `SELECT c.contestant_name, tm.is_ultimate_survivor
     FROM teams t
     JOIN team_members tm ON tm.team_id = t.id
     JOIN contestants c ON c.id = tm.contestant_id
     WHERE t.user_id = $1
     ORDER BY tm.is_ultimate_survivor DESC, c.contestant_name`,
    [userId],
  );
  const team = teamResult.rows.map((row) => ({
    name: row.contestant_name as string,
    isUltimateSurvivor: row.is_ultimate_survivor as boolean,
  }));

  // The full contestant pool, used to render the picker when the user has
  // no team yet. Harmless to fetch even when it won't be used — it's a
  // small, cheap query (21 rows).
  const contestantsResult = await pool.query(
    "SELECT id, contestant_name FROM contestants ORDER BY contestant_name",
  );
  const contestants = contestantsResult.rows as {
    id: number;
    contestant_name: string;
  }[];

  return { user, team, contestants };
}

// Handles the team-picker form submission (POST /dashboard). Creates the
// user's team and its TEAM_SIZE members — one of them flagged as the
// "Ultimate Survivor" pick — in a single transaction, so a failure partway
// through (e.g. a duplicate team) can't leave a half-saved team behind.
export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  // `getAll` returns every checked checkbox's value; wrapping in a Set drops
  // any accidental duplicates before we validate the count.
  const contestantIds = [
    ...new Set(formData.getAll("contestantId").map(Number)),
  ];
  const ultimateSurvivorId = Number(formData.get("ultimateSurvivorId"));

  // The team-size rule and "the Ultimate Survivor pick must be one of the
  // selected contestants" rule both live here in application code rather
  // than as database constraints, so this is the one place that needs to
  // change if either rule does.
  if (
    contestantIds.length !== TEAM_SIZE ||
    contestantIds.some((id) => !Number.isInteger(id)) ||
    !Number.isInteger(ultimateSurvivorId) ||
    !contestantIds.includes(ultimateSurvivorId)
  ) {
    return {
      error: `Select ${TEAM_SIZE} contestants and choose your Ultimate Survivor`,
    };
  }

  // A dedicated client (rather than pool.query) is needed here because a
  // transaction's BEGIN/COMMIT/ROLLBACK must all run on the same connection.
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
        `INSERT INTO team_members (team_id, contestant_id, is_ultimate_survivor)
         VALUES ($1, $2, $3)`,
        [team.id, contestantId, contestantId === ultimateSurvivorId],
      );
    }
    await client.query("COMMIT");
  } catch {
    // Most likely cause: the user already has a team (teams.user_id is
    // UNIQUE) — e.g. a double-submit or a second tab. Roll back so no
    // partial team is left in the database.
    await client.query("ROLLBACK");
    return { error: "Could not save your team. You may already have one." };
  } finally {
    // Always release the connection back to the pool, success or failure.
    client.release();
  }

  // Re-fetch the dashboard so it now renders the saved roster instead of the
  // picker.
  return redirect("/dashboard");
}

// Purely presentational: picks which view to show based on whether the user
// already has a team, and hands each component the data it needs.
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
        <ScoringMetricsModal />
      </div>
    </main>
  );
}
