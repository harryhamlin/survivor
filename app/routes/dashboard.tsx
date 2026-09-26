// The "/dashboard" route: the main page a logged-in user sees. Shows either
// a picker to build their team of contestants (if they haven't yet) or their
// saved team roster, plus the weekly elimination/immunity picks.
import { redirect } from "react-router";
import type { Route } from "./+types/dashboard";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { TEAM_SIZE, IN_SHOW_TEAMS } from "../constants";
import {
  isTeamLocked,
  TEAM_LOCK_DEADLINE_LABEL,
  getWeeklyPicksDeadlineLabel,
  getCurrentWeekNumber,
} from "../deadlines.server";
import { TopBanner } from "../components/TopBanner";
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

  const result = await pool.query("SELECT username FROM users WHERE id = $1", [
    userId,
  ]);
  const user = result.rows[0] as { username: string };

  // The user's team, if they've already picked one (joins teams ->
  // team_members -> contestants to get the actual names, not just ids). The
  // contestant id is included so TeamSection can pre-fill an edit of this
  // team, and `eliminated` so the roster can flag a member who's since been
  // voted out — both stay on the roster regardless (see the note on
  // teamPickableContestants below).
  const teamResult = await pool.query(
    `SELECT c.id, c.contestant_name, tm.is_ultimate_survivor, c.eliminated
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
    eliminated: row.eliminated as boolean,
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
  // their first submission this week). The eliminated contestant's name is
  // joined in directly here (rather than looked up from activeContestants)
  // so the display box is correct even if their eliminated status changes
  // after the pick was made. The immunity pick is just a team name, so it
  // needs no join.
  const currentWeek = getCurrentWeekNumber();
  const weeklyPicksResult = await pool.query(
    `SELECT
       wp.predicted_eliminated_id,
       ec.contestant_name AS eliminated_name,
       wp.predicted_immunity_winner_team
     FROM weekly_picks wp
     JOIN contestants ec ON ec.id = wp.predicted_eliminated_id
     WHERE wp.user_id = $1 AND wp.week_number = $2`,
    [userId, currentWeek],
  );
  const weeklyPicksRow = weeklyPicksResult.rows[0] as
    | {
        predicted_eliminated_id: number;
        eliminated_name: string;
        predicted_immunity_winner_team: string;
      }
    | undefined;
  const weeklyPicks = weeklyPicksRow
    ? {
        eliminatedId: weeklyPicksRow.predicted_eliminated_id,
        eliminatedName: weeklyPicksRow.eliminated_name,
        immunityWinnerTeam: weeklyPicksRow.predicted_immunity_winner_team,
      }
    : null;

  return {
    user,
    team,
    teamPickableContestants,
    activeContestants,
    weeklyPicks,
    isTeamLocked: isTeamLocked(),
    teamLockDeadlineLabel: TEAM_LOCK_DEADLINE_LABEL,
    weeklyPicksDeadlineLabel: getWeeklyPicksDeadlineLabel(),
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
// wins immunity this week. Upserted on (user_id, week_number) — editing this
// week's picks again overwrites them, but past weeks stay untouched, so
// history builds up for the /scores page. Unlike the team draft, there's no
// deadline enforcement here: next week's picks become available at the same
// moment this week's are due, so the form is always open (see the comment on
// WEEKLY_LOCK_DAY in deadlines.server.ts).
async function weeklyPicksAction(userId: number, formData: FormData) {
  const eliminatedId = Number(formData.get("eliminatedId"));
  const immunityWinnerTeam = formData.get("immunityWinnerTeam");

  if (
    !Number.isInteger(eliminatedId) ||
    typeof immunityWinnerTeam !== "string" ||
    !IN_SHOW_TEAMS.includes(immunityWinnerTeam as (typeof IN_SHOW_TEAMS)[number])
  ) {
    return {
      intent: "weekly-picks" as const,
      error: "Pick a contestant and an immunity team",
    };
  }

  try {
    await pool.query(
      `INSERT INTO weekly_picks (user_id, week_number, predicted_eliminated_id, predicted_immunity_winner_team)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, week_number) DO UPDATE SET
         predicted_eliminated_id = EXCLUDED.predicted_eliminated_id,
         predicted_immunity_winner_team = EXCLUDED.predicted_immunity_winner_team,
         updated_at = now()`,
      [userId, getCurrentWeekNumber(), eliminatedId, immunityWinnerTeam],
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
// needs. The deadline/lock explanations for both sections are rendered once,
// together, at the bottom of the page rather than inline in each section.
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
    weeklyPicksDeadlineLabel,
  } = loaderData;
  const hasTeam = team.length > 0;

  return (
    <main className="min-h-screen bg-background">
      <TopBanner username={user.username} page="dashboard" />
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
        <WeeklyPicksModal
          key={JSON.stringify(weeklyPicks)}
          contestants={activeContestants}
          currentPicks={weeklyPicks}
          error={
            actionData?.intent === "weekly-picks"
              ? actionData.error
              : undefined
          }
        />
        <p className="text-center text-sm text-primary/70">
          weekly picks are due {weeklyPicksDeadlineLabel} — next week&apos;s
          picks open right after.
        </p>
        <TeamSection
          key={JSON.stringify(team)}
          team={team}
          contestants={teamPickableContestants}
          isLocked={teamLocked}
          error={
            actionData?.intent === "create-team" ? actionData.error : undefined
          }
        />
        <div className="space-y-1 text-center text-sm text-primary/70">
          <p>
            {teamLocked
              ? hasTeam
                ? `Your team locked ${teamLockDeadlineLabel} and can no longer be changed.`
                : `Team selection closed ${teamLockDeadlineLabel} — you didn't pick a team in time.`
              : `You can change your final 3 until ${teamLockDeadlineLabel}, after which it locks for all eternity.`}
          </p>
        </div>
        <ScoringMetricsModal />
      </div>
    </main>
  );
}
