// The "/dashboard" route: the main page a logged-in user sees. Shows either
// a picker to build their team of contestants (if they haven't yet) or their
// saved team roster, plus the weekly elimination/immunity picks.
import { redirect } from "react-router";
import type { Route } from "./+types/dashboard";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { TEAM_SIZE } from "../constants";
import {
  isTeamLocked,
  isWeeklyPicksLocked,
  TEAM_LOCK_DEADLINE_LABEL,
  getWeeklyPicksDeadlineLabel,
  getWeeklyPicksReopenDayLabel,
} from "../deadlines.server";
import { DashboardHeader } from "../components/DashboardHeader";
import { TeamSection } from "../components/TeamSection";
import { ScoringMetricsModal } from "../components/ScoringMetricsModal";
import { WeeklyPicksModal } from "../components/WeeklyPicksModal";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "dashboard" },
    { name: "description", content: "Your dashboard" },
  ];
}

// Loads everything the page needs to render. Runs on every GET to
// /dashboard (including right after either form's action redirects back
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
  // team_members -> contestants to get the actual names, not just ids). The
  // contestant id is included so TeamSection can pre-fill an edit of this
  // team, even for a contestant who has since been eliminated.
  const teamResult = await pool.query(
    `SELECT c.id, c.contestant_name, tm.is_ultimate_survivor
     FROM teams t
     JOIN team_members tm ON tm.team_id = t.id
     JOIN contestants c ON c.id = tm.contestant_id
     WHERE t.user_id = $1
     ORDER BY tm.is_ultimate_survivor DESC, c.contestant_name`,
    [userId],
  );
  const team = teamResult.rows.map((row) => ({
    id: row.id as number,
    name: row.contestant_name as string,
    isUltimateSurvivor: row.is_ultimate_survivor as boolean,
  }));

  // Contestants a team can be built from: anyone still in the game, plus —
  // so editing an existing team never silently drops someone — anyone
  // already on *this* user's team even if they've since been eliminated.
  const teamPickableContestantsResult = await pool.query(
    `SELECT id, contestant_name FROM contestants
     WHERE NOT eliminated
        OR id IN (
          SELECT tm.contestant_id FROM team_members tm
          JOIN teams t ON t.id = tm.team_id
          WHERE t.user_id = $1
        )
     ORDER BY contestant_name`,
    [userId],
  );
  const teamPickableContestants = teamPickableContestantsResult.rows as {
    id: number;
    contestant_name: string;
  }[];

  // Contestants who can still be predicted to be voted out or win immunity
  // this week — always just whoever hasn't been eliminated yet.
  const activeContestantsResult = await pool.query(
    "SELECT id, contestant_name FROM contestants WHERE NOT eliminated ORDER BY contestant_name",
  );
  const activeContestants = activeContestantsResult.rows as {
    id: number;
    contestant_name: string;
  }[];

  // This week's predictions, if the user has already made them (null until
  // their first submission, then always the latest pair — see the note on
  // weekly_picks in schema.sql).
  const weeklyPicksResult = await pool.query(
    `SELECT predicted_eliminated_id, predicted_immunity_winner_id
     FROM weekly_picks WHERE user_id = $1`,
    [userId],
  );
  const weeklyPicksRow = weeklyPicksResult.rows[0] as
    | { predicted_eliminated_id: number; predicted_immunity_winner_id: number }
    | undefined;
  const weeklyPicks = weeklyPicksRow
    ? {
        eliminatedId: weeklyPicksRow.predicted_eliminated_id,
        immunityWinnerId: weeklyPicksRow.predicted_immunity_winner_id,
      }
    : null;

  const weeklyPicksLocked = isWeeklyPicksLocked();

  return {
    user,
    team,
    teamPickableContestants,
    activeContestants,
    weeklyPicks,
    isTeamLocked: isTeamLocked(),
    teamLockDeadlineLabel: TEAM_LOCK_DEADLINE_LABEL,
    isWeeklyPicksLocked: weeklyPicksLocked,
    weeklyPicksDeadlineLabel: getWeeklyPicksDeadlineLabel(),
    weeklyPicksReopenDayLabel: weeklyPicksLocked
      ? getWeeklyPicksReopenDayLabel()
      : null,
  };
}

// The dashboard has two independent forms (team picker, weekly picks) both
// posting to this same route, so each submission carries a hidden `intent`
// field to say which one it is. Each branch's error is tagged with the same
// intent, so the two forms — rendered on the page at the same time — only
// ever show their own error, never each other's.
export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "weekly-picks") {
    return weeklyPicksAction(userId, formData);
  }
  return createOrUpdateTeamAction(userId, formData);
}

// Creates the user's team the first time, or replaces its members if they
// already have one (editing) — one of the TEAM_SIZE members flagged as the
// "Ultimate Survivor" pick. Both cases run in a single transaction, so a
// failure partway through can't leave a half-saved team behind. Blocked
// entirely once the draft has locked, since that's checked server-side too
// (not just by hiding the UI) in case a request is replayed after the
// deadline passes.
async function createOrUpdateTeamAction(userId: number, formData: FormData) {
  if (isTeamLocked()) {
    return {
      intent: "create-team" as const,
      error: "Team selection is locked and can no longer be changed",
    };
  }

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
      intent: "create-team" as const,
      error: `Select ${TEAM_SIZE} contestants and choose your Ultimate Survivor`,
    };
  }

  // A dedicated client (rather than pool.query) is needed here because a
  // transaction's BEGIN/COMMIT/ROLLBACK must all run on the same connection.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // `ON CONFLICT ... DO UPDATE` (rather than plain INSERT) is what makes
    // this work for both a brand-new team and an edit of an existing one —
    // it returns the existing row's id when the user already has a team,
    // instead of failing on the UNIQUE(user_id) constraint.
    const {
      rows: [team],
    } = await client.query(
      `INSERT INTO teams (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING id`,
      [userId],
    );
    // Simplest correct way to handle an edit: drop the old roster and
    // re-insert the new one, rather than diffing old vs. new members.
    await client.query("DELETE FROM team_members WHERE team_id = $1", [
      team.id,
    ]);
    for (const contestantId of contestantIds) {
      await client.query(
        `INSERT INTO team_members (team_id, contestant_id, is_ultimate_survivor)
         VALUES ($1, $2, $3)`,
        [team.id, contestantId, contestantId === ultimateSurvivorId],
      );
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return {
      intent: "create-team" as const,
      error: "Could not save your team",
    };
  } finally {
    // Always release the connection back to the pool, success or failure.
    client.release();
  }

  // Re-fetch the dashboard so it now renders the saved roster instead of the
  // picker.
  return redirect("/dashboard");
}

// Saves (or updates) the user's prediction for who gets voted out and who
// wins immunity this week. Upserted rather than inserted — see the note on
// weekly_picks in schema.sql for why there's only ever one row per user.
// Blocked server-side once this week's picks have locked, same reasoning as
// the team lock above.
async function weeklyPicksAction(userId: number, formData: FormData) {
  if (isWeeklyPicksLocked()) {
    return {
      intent: "weekly-picks" as const,
      error: "This week's picks are locked",
    };
  }

  const eliminatedId = Number(formData.get("eliminatedId"));
  const immunityWinnerId = Number(formData.get("immunityWinnerId"));

  if (
    !Number.isInteger(eliminatedId) ||
    !Number.isInteger(immunityWinnerId) ||
    eliminatedId === immunityWinnerId
  ) {
    return {
      intent: "weekly-picks" as const,
      error: "Pick two different contestants",
    };
  }

  try {
    await pool.query(
      `INSERT INTO weekly_picks (user_id, predicted_eliminated_id, predicted_immunity_winner_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         predicted_eliminated_id = EXCLUDED.predicted_eliminated_id,
         predicted_immunity_winner_id = EXCLUDED.predicted_immunity_winner_id,
         updated_at = now()`,
      [userId, eliminatedId, immunityWinnerId],
    );
  } catch {
    return {
      intent: "weekly-picks" as const,
      error: "Could not save your picks",
    };
  }

  return redirect("/dashboard");
}

// Purely presentational: hands each section the data and lock state it
// needs.
export default function Dashboard({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const {
    user,
    team,
    teamPickableContestants,
    activeContestants,
    weeklyPicks,
    isTeamLocked: teamLocked,
    teamLockDeadlineLabel,
    isWeeklyPicksLocked: weeklyPicksLocked,
    weeklyPicksDeadlineLabel,
    weeklyPicksReopenDayLabel,
  } = loaderData;

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-2xl space-y-8">
        <DashboardHeader username={user.username} />
        <WeeklyPicksModal
          key={JSON.stringify(weeklyPicks)}
          contestants={activeContestants}
          currentPicks={weeklyPicks}
          isLocked={weeklyPicksLocked}
          deadlineLabel={weeklyPicksDeadlineLabel}
          reopenDayLabel={weeklyPicksReopenDayLabel}
          error={
            actionData?.intent === "weekly-picks"
              ? actionData.error
              : undefined
          }
        />
        <TeamSection
          key={JSON.stringify(team)}
          createdAt={user.created_at}
          team={team}
          contestants={teamPickableContestants}
          isLocked={teamLocked}
          lockDeadlineLabel={teamLockDeadlineLabel}
          error={
            actionData?.intent === "create-team" ? actionData.error : undefined
          }
        />
        <ScoringMetricsModal />
      </div>
    </main>
  );
}
