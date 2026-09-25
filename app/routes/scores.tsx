// The "/scores" route: a spreadsheet-style view — every user's team and
// cumulative score, plus a column for each week's elimination/immunity
// picks. Requires being logged in.
import type { Route } from "./+types/scores";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { getCurrentWeekNumber } from "../deadlines.server";
import { DetailedScores } from "../components/DetailedScores";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "detailed scores" },
    { name: "description", content: "Detailed team scores" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Nothing else on the page depends on which user this is, beyond
  // requiring someone to be logged in and greeting them in the top banner.
  const userId = await requireUserId(request);
  const userResult = await pool.query(
    "SELECT username FROM users WHERE id = $1",
    [userId],
  );
  const username = userResult.rows[0].username as string;

  // One row per user, with their team's contestant names pre-aggregated
  // into an array (ultimate survivor first) plus that pick called out on its
  // own — a LEFT JOIN all the way through so a user with no team yet still
  // gets a row (empty team array, null ultimate survivor).
  const usersResult = await pool.query(
    `SELECT
       u.username,
       u.name,
       COALESCE(t.cumulative_score, 0) AS cumulative_score,
       COALESCE(
         array_agg(c.contestant_name ORDER BY tm.is_ultimate_survivor DESC, c.contestant_name)
           FILTER (WHERE c.contestant_name IS NOT NULL),
         ARRAY[]::text[]
       ) AS team_names,
       MAX(c.contestant_name) FILTER (WHERE tm.is_ultimate_survivor) AS ultimate_survivor_name
     FROM users u
     LEFT JOIN teams t ON t.user_id = u.id
     LEFT JOIN team_members tm ON tm.team_id = t.id
     LEFT JOIN contestants c ON c.id = tm.contestant_id
     GROUP BY u.id, u.username, u.name, t.cumulative_score
     ORDER BY cumulative_score DESC, u.username ASC`,
  );

  // Every week's picks, for every user, in one query — grouped into a
  // per-username map below rather than queried once per user per week.
  const picksResult = await pool.query(
    `SELECT
       u.username,
       wp.week_number,
       ec.contestant_name AS eliminated_name,
       ic.contestant_name AS immunity_winner_name
     FROM weekly_picks wp
     JOIN users u ON u.id = wp.user_id
     JOIN contestants ec ON ec.id = wp.predicted_eliminated_id
     JOIN contestants ic ON ic.id = wp.predicted_immunity_winner_id
     ORDER BY u.username ASC, wp.week_number ASC`,
  );

  const picksByUsername = new Map<
    string,
    Map<number, { eliminatedName: string; immunityWinnerName: string }>
  >();
  for (const row of picksResult.rows) {
    const username = row.username as string;
    if (!picksByUsername.has(username)) {
      picksByUsername.set(username, new Map());
    }
    picksByUsername.get(username)!.set(row.week_number as number, {
      eliminatedName: row.eliminated_name as string,
      immunityWinnerName: row.immunity_winner_name as string,
    });
  }

  const currentWeek = getCurrentWeekNumber();
  const weeks = Array.from({ length: currentWeek }, (_, i) => i + 1);

  const rows = usersResult.rows.map((row) => {
    const username = row.username as string;
    const picksByWeek = picksByUsername.get(username);
    const name = row.name as string | null;
    // Just the first name, so "Jane Doe" displays as "Jane (jdoe)" rather
    // than the full name — falls back to the username alone for accounts
    // with no name set (e.g. seeded before the signup form required one).
    const firstName = name?.trim().split(/\s+/)[0];
    return {
      username,
      displayName: firstName ? `${firstName} (${username})` : username,
      cumulativeScore: row.cumulative_score as number,
      team: row.team_names as string[],
      ultimateSurvivor: row.ultimate_survivor_name as string | null,
      picks: weeks.map((week) => picksByWeek?.get(week) ?? null),
    };
  });

  return { username, weeks, rows };
}

export default function Scores({ loaderData }: Route.ComponentProps) {
  return (
    <DetailedScores
      username={loaderData.username}
      weeks={loaderData.weeks}
      rows={loaderData.rows}
    />
  );
}
