// The "/dashboard" route: the main page a logged-in user sees. Shows either
// a picker to build their draft (if they haven't yet) or their saved
// roster, plus the weekly elimination/immunity picks.
import { redirect } from "react-router";
import type { Route } from "./+types/dashboard";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { getOrCreateFantasyPlayer } from "../players.server";
import {
  getCurrentSeason,
  getCurrentEpisode,
  getDraftLockAt,
  isLocked,
  formatPacific,
} from "../season.server";
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

  const userResult = await pool.query(
    "SELECT username, name, email FROM users WHERE id = $1",
    [userId],
  );
  const userRow = userResult.rows[0] as {
    username: string;
    name: string | null;
    email: string | null;
  };
  const player = await getOrCreateFantasyPlayer(userId, {
    displayName: userRow.name ?? userRow.username,
    email: userRow.email,
  });

  const season = await getCurrentSeason();
  if (!season) {
    // No season has been entered yet — nothing else on this page can render
    // without one.
    return { user: userRow, season: null as null } as const;
  }

  // The player's draft, if they've already made one (joins draft_picks ->
  // contestants to get the actual names, not just ids). `eliminated` is
  // derived from episode_results (a contestant is out once they show up as
  // some episode's eliminated_contestant_id), not stored directly — see the
  // comment on contestants.final_placement in db/schema.sql.
  const teamResult = await pool.query(
    `SELECT
       c.id,
       c.name,
       dp.is_ultimate_pick,
       EXISTS (
         SELECT 1 FROM episode_results er WHERE er.eliminated_contestant_id = c.id
       ) AS eliminated
     FROM draft_picks dp
     JOIN contestants c ON c.id = dp.contestant_id
     WHERE dp.season_id = $1 AND dp.player_id = $2
     ORDER BY dp.is_ultimate_pick DESC, c.name`,
    [season.id, player.id],
  );
  const team = teamResult.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    isUltimateSurvivor: row.is_ultimate_pick as boolean,
    eliminated: row.eliminated as boolean,
  }));

  // Contestants a draft can be built from: anyone in the season still in the
  // game, plus — so editing an existing draft never silently drops someone —
  // anyone already drafted by *this* player even if they've since been
  // eliminated.
  const draftPickableContestantsResult = await pool.query(
    `SELECT id, name FROM contestants c
     WHERE c.season_id = $1
       AND (
         NOT EXISTS (
           SELECT 1 FROM episode_results er WHERE er.eliminated_contestant_id = c.id
         )
         OR id IN (
           SELECT contestant_id FROM draft_picks
           WHERE season_id = $1 AND player_id = $2
         )
       )
     ORDER BY name`,
    [season.id, player.id],
  );
  const draftPickableContestants = draftPickableContestantsResult.rows as {
    id: number;
    name: string;
  }[];

  // Contestants who can still be predicted to be voted out this week —
  // always just whoever in the season hasn't been eliminated yet.
  const activeContestantsResult = await pool.query(
    `SELECT c.id, c.name FROM contestants c
     WHERE c.season_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM episode_results er WHERE er.eliminated_contestant_id = c.id
       )
     ORDER BY c.name`,
    [season.id],
  );
  const activeContestants = activeContestantsResult.rows as {
    id: number;
    name: string;
  }[];

  // This season's tribes — the choices for the weekly immunity pick.
  const tribesResult = await pool.query(
    "SELECT id, name, color FROM tribes WHERE season_id = $1 ORDER BY name",
    [season.id],
  );
  const tribes = tribesResult.rows as {
    id: number;
    name: string;
    color: string;
  }[];

  const draftLockAt = await getDraftLockAt(season.id);
  const currentEpisode = await getCurrentEpisode(season.id);

  // This episode's predictions, if the player has already made them (null
  // until their first submission for this episode, or if every episode has
  // already locked). The eliminated contestant's and tribe's names are
  // joined in directly here so the display box stays correct even if their
  // state changes after the pick was made.
  let weeklyPicks: {
    eliminationPickId: number;
    eliminationPickName: string;
    immunityTribePickId: number;
    immunityTribePickName: string;
  } | null = null;
  if (currentEpisode) {
    const weeklyPicksResult = await pool.query(
      `SELECT
         wp.elimination_pick_id,
         c.name AS elimination_pick_name,
         wp.immunity_tribe_pick_id,
         t.name AS immunity_tribe_pick_name
       FROM weekly_picks wp
       JOIN contestants c ON c.id = wp.elimination_pick_id
       JOIN tribes t ON t.id = wp.immunity_tribe_pick_id
       WHERE wp.episode_id = $1 AND wp.player_id = $2`,
      [currentEpisode.id, player.id],
    );
    const row = weeklyPicksResult.rows[0] as
      | {
          elimination_pick_id: number;
          elimination_pick_name: string;
          immunity_tribe_pick_id: number;
          immunity_tribe_pick_name: string;
        }
      | undefined;
    weeklyPicks = row
      ? {
          eliminationPickId: row.elimination_pick_id,
          eliminationPickName: row.elimination_pick_name,
          immunityTribePickId: row.immunity_tribe_pick_id,
          immunityTribePickName: row.immunity_tribe_pick_name,
        }
      : null;
  }

  return {
    user: userRow,
    season,
    team,
    draftPickableContestants,
    activeContestants,
    tribes,
    weeklyPicks,
    hasCurrentEpisode: currentEpisode !== null,
    isDraftLocked: isLocked(draftLockAt),
    draftLockLabel: draftLockAt ? formatPacific(draftLockAt) : null,
    weeklyPicksLockLabel: currentEpisode
      ? formatPacific(currentEpisode.picksLockAt)
      : null,
  } as const;
}

// The dashboard has two independent forms (draft picker, weekly picks) both
// posting to this same route, so each submission carries a hidden `intent`
// field to say which one it is. Each branch's error is tagged with the same
// intent, so the two forms — rendered on the page at the same time — only
// ever show their own error, never each other's.
export async function action({ request }: Route.ActionArgs) {
  const userId = await requireUserId(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  const season = await getCurrentSeason();
  if (!season) {
    return { intent: "create-team" as const, error: "No active season" };
  }

  const userResult = await pool.query(
    "SELECT username, name, email FROM users WHERE id = $1",
    [userId],
  );
  const userRow = userResult.rows[0] as {
    username: string;
    name: string | null;
    email: string | null;
  };
  const player = await getOrCreateFantasyPlayer(userId, {
    displayName: userRow.name ?? userRow.username,
    email: userRow.email,
  });

  if (intent === "weekly-picks") {
    return weeklyPicksAction(player.id, season.id, formData);
  }
  return createOrUpdateDraftAction(player.id, season.id, formData);
}

// Creates the player's draft the first time, or replaces it if they already
// have one (editing) — one of the season's finalist_count picks flagged as
// the "Ultimate Survivor" pick. Runs in a single transaction, so a failure
// partway through can't leave a half-saved draft behind. Blocked entirely
// once the draft has locked, since that's checked server-side too (not just
// by hiding the UI) in case a request is replayed after the deadline
// passes.
async function createOrUpdateDraftAction(
  playerId: number,
  seasonId: number,
  formData: FormData,
) {
  const draftLockAt = await getDraftLockAt(seasonId);
  if (isLocked(draftLockAt)) {
    return {
      intent: "create-team" as const,
      error: "The draft is locked and can no longer be changed",
    };
  }

  const {
    rows: [{ finalist_count: finalistCount }],
  } = await pool.query("SELECT finalist_count FROM seasons WHERE id = $1", [
    seasonId,
  ]);

  // `getAll` returns every checked checkbox's value; wrapping in a Set drops
  // any accidental duplicates before we validate the count.
  const contestantIds = [
    ...new Set(formData.getAll("contestantId").map(Number)),
  ];
  const ultimateSurvivorId = Number(formData.get("ultimateSurvivorId"));

  // The roster-size rule and "the Ultimate Survivor pick must be one of the
  // selected contestants" rule both live here in application code rather
  // than as database constraints, so this is the one place that needs to
  // change if either rule does.
  if (
    contestantIds.length !== finalistCount ||
    contestantIds.some((id) => !Number.isInteger(id)) ||
    !Number.isInteger(ultimateSurvivorId) ||
    !contestantIds.includes(ultimateSurvivorId)
  ) {
    return {
      intent: "create-team" as const,
      error: `Select ${finalistCount} contestants and choose your Ultimate Survivor`,
    };
  }

  // A dedicated client (rather than pool.query) is needed here because a
  // transaction's BEGIN/COMMIT/ROLLBACK must all run on the same connection.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Simplest correct way to handle an edit: drop the old draft and
    // re-insert the new one, rather than diffing old vs. new picks.
    await client.query(
      "DELETE FROM draft_picks WHERE season_id = $1 AND player_id = $2",
      [seasonId, playerId],
    );
    for (const contestantId of contestantIds) {
      await client.query(
        `INSERT INTO draft_picks (season_id, player_id, contestant_id, is_ultimate_pick)
         VALUES ($1, $2, $3, $4)`,
        [seasonId, playerId, contestantId, contestantId === ultimateSurvivorId],
      );
    }
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK");
    return {
      intent: "create-team" as const,
      error: "Could not save your draft",
    };
  } finally {
    // Always release the connection back to the pool, success or failure.
    client.release();
  }

  // Re-fetch the dashboard so it now renders the saved roster instead of the
  // picker.
  return redirect("/dashboard");
}

// Saves (or updates) the player's prediction for who gets voted out and
// which tribe wins immunity, for whichever episode is currently open for
// picks. Upserted on (episode_id, player_id) — editing this episode's picks
// again overwrites them, but past episodes stay untouched, so history
// builds up for the /leaderboard page.
async function weeklyPicksAction(
  playerId: number,
  seasonId: number,
  formData: FormData,
) {
  const currentEpisode = await getCurrentEpisode(seasonId);
  if (!currentEpisode) {
    return {
      intent: "weekly-picks" as const,
      error: "There's no episode currently open for picks",
    };
  }

  const eliminationPickId = Number(formData.get("eliminationPickId"));
  const immunityTribePickId = Number(formData.get("immunityTribePickId"));

  if (
    !Number.isInteger(eliminationPickId) ||
    !Number.isInteger(immunityTribePickId)
  ) {
    return {
      intent: "weekly-picks" as const,
      error: "Pick a contestant and an immunity tribe",
    };
  }

  try {
    await pool.query(
      `INSERT INTO weekly_picks (episode_id, player_id, elimination_pick_id, immunity_tribe_pick_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (episode_id, player_id) DO UPDATE SET
         elimination_pick_id = EXCLUDED.elimination_pick_id,
         immunity_tribe_pick_id = EXCLUDED.immunity_tribe_pick_id,
         submitted_at = now()`,
      [currentEpisode.id, playerId, eliminationPickId, immunityTribePickId],
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
  const { user } = loaderData;

  if (!loaderData.season) {
    return (
      <main className="min-h-screen bg-background">
        <TopBanner username={user.username} page="dashboard" />
        <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
          <p className="text-center text-primary/70">
            No active season yet — check back soon.
          </p>
        </div>
      </main>
    );
  }

  const {
    team,
    draftPickableContestants,
    activeContestants,
    tribes,
    weeklyPicks,
    hasCurrentEpisode,
    isDraftLocked,
    draftLockLabel,
    weeklyPicksLockLabel,
  } = loaderData;
  const hasTeam = team.length > 0;

  return (
    <main className="min-h-screen bg-background">
      <TopBanner username={user.username} page="dashboard" />
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-12">
        {hasCurrentEpisode ? (
          <>
            <WeeklyPicksModal
              key={JSON.stringify(weeklyPicks)}
              contestants={activeContestants}
              tribes={tribes}
              currentPicks={weeklyPicks}
              error={
                actionData?.intent === "weekly-picks"
                  ? actionData.error
                  : undefined
              }
            />
            {weeklyPicksLockLabel && (
              <p className="text-center text-sm text-primary/70">
                this episode&apos;s picks are due {weeklyPicksLockLabel}.
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-sm text-primary/70">
            No episode is currently open for picks.
          </p>
        )}
        <TeamSection
          key={JSON.stringify(team)}
          team={team}
          contestants={draftPickableContestants}
          finalistCount={loaderData.season.finalistCount}
          isLocked={isDraftLocked}
          error={
            actionData?.intent === "create-team" ? actionData.error : undefined
          }
        />
        <div className="space-y-1 text-center text-sm text-primary/70">
          <p>
            {isDraftLocked
              ? hasTeam
                ? `Your team locked ${draftLockLabel} and can no longer be changed.`
                : `Team selection closed ${draftLockLabel} — you didn't pick a team in time.`
              : draftLockLabel
                ? `You can change your final ${loaderData.season.finalistCount} until ${draftLockLabel}, after which it locks for all eternity.`
                : "The draft lock time hasn't been set yet."}
          </p>
        </div>
        <ScoringMetricsModal />
      </div>
    </main>
  );
}
