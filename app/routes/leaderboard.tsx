// The "/leaderboard" route: a spreadsheet-style view — every fantasy
// player's draft and score, plus a column for each episode's
// elimination/immunity picks. Requires being logged in. Distinct from "/"'s
// public one-line-per-player standings summary (see home.tsx).
import type { Route } from "./+types/leaderboard";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { getCurrentSeason } from "../season.server";
import { DetailedScores } from "../components/DetailedScores";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "leaderboard" },
    { name: "description", content: "Detailed player scores" },
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

  const season = await getCurrentSeason();
  if (!season) {
    return { username, episodeNumbers: [], rows: [] };
  }

  // One row per fantasy player, with their draft's contestant names
  // pre-aggregated into an array (ultimate pick first) plus that pick called
  // out on its own — LEFT JOINed all the way through so a player with no
  // draft yet still gets a row (empty team array, null ultimate pick, score
  // 0). Also joins back to users for the login's `name`/`username`, used
  // only to format the display name below. The score itself is the one
  // documented rule (see ScoringMetricsModal): +4 per drafted contestant who
  // reaches the season's final `finalist_count`, +4 more if the Ultimate
  // Survivor pick specifically wins (final_placement = 1) — computed here
  // rather than stored, since contestants.final_placement and
  // seasons.finalist_count are exactly the data this rule needs.
  const playersResult = await pool.query(
    `SELECT
       fp.id AS player_id,
       u.username,
       u.name,
       COALESCE(
         array_agg(c.name ORDER BY dp.is_ultimate_pick DESC, c.name)
           FILTER (WHERE c.name IS NOT NULL),
         ARRAY[]::text[]
       ) AS team_names,
       MAX(c.name) FILTER (WHERE dp.is_ultimate_pick) AS ultimate_pick_name,
       COALESCE(SUM(
         CASE WHEN c.final_placement IS NOT NULL AND c.final_placement <= $2
           THEN 4 ELSE 0 END
       ), 0)
       + COALESCE(MAX(
           CASE WHEN dp.is_ultimate_pick AND c.final_placement = 1 THEN 4 ELSE 0 END
         ), 0) AS score
     FROM fantasy_players fp
     JOIN users u ON u.id = fp.user_id
     LEFT JOIN draft_picks dp ON dp.player_id = fp.id AND dp.season_id = $1
     LEFT JOIN contestants c ON c.id = dp.contestant_id
     GROUP BY fp.id, u.username, u.name
     ORDER BY score DESC, u.username ASC`,
    [season.id, season.finalistCount],
  );

  // Every episode's picks, for every player, in one query — grouped into a
  // per-player map below rather than queried once per player per episode.
  // The two immunity joins are LEFT JOINs (and their names COALESCEd into
  // one) since only one of immunity_tribe_pick_id/immunity_contestant_pick_id
  // is ever set on a given row, depending on that episode's immunity_type.
  const picksResult = await pool.query(
    `SELECT
       wp.player_id,
       e.episode_number,
       c.name AS elimination_pick_name,
       COALESCE(t.name, ic.name) AS immunity_pick_name
     FROM weekly_picks wp
     JOIN episodes e ON e.id = wp.episode_id
     JOIN contestants c ON c.id = wp.elimination_pick_id
     LEFT JOIN tribes t ON t.id = wp.immunity_tribe_pick_id
     LEFT JOIN contestants ic ON ic.id = wp.immunity_contestant_pick_id
     WHERE e.season_id = $1
     ORDER BY wp.player_id ASC, e.episode_number ASC`,
    [season.id],
  );

  const picksByPlayerId = new Map<
    number,
    Map<number, { eliminationPickName: string; immunityPickName: string }>
  >();
  for (const row of picksResult.rows) {
    const playerId = row.player_id as number;
    if (!picksByPlayerId.has(playerId)) {
      picksByPlayerId.set(playerId, new Map());
    }
    picksByPlayerId.get(playerId)!.set(row.episode_number as number, {
      eliminationPickName: row.elimination_pick_name as string,
      immunityPickName: row.immunity_pick_name as string,
    });
  }

  const episodesResult = await pool.query(
    "SELECT episode_number FROM episodes WHERE season_id = $1 ORDER BY episode_number",
    [season.id],
  );
  const episodeNumbers = episodesResult.rows.map(
    (row) => row.episode_number as number,
  );

  const rows = playersResult.rows.map((row) => {
    const playerId = row.player_id as number;
    const picksByEpisode = picksByPlayerId.get(playerId);
    const playerUsername = row.username as string;
    const name = row.name as string | null;
    // Just the first name, so "Jane Doe" displays as "Jane (jdoe)" rather
    // than the full name — falls back to the username alone for accounts
    // with no name set (e.g. seeded before the signup form required one).
    const firstName = name?.trim().split(/\s+/)[0];
    return {
      playerId,
      displayName: firstName
        ? `${firstName} (${playerUsername})`
        : playerUsername,
      score: Number(row.score),
      team: row.team_names as string[],
      ultimatePick: row.ultimate_pick_name as string | null,
      picks: episodeNumbers.map(
        (episodeNumber) => picksByEpisode?.get(episodeNumber) ?? null,
      ),
    };
  });

  return { username, episodeNumbers, rows };
}

export default function Leaderboard({ loaderData }: Route.ComponentProps) {
  return (
    <DetailedScores
      username={loaderData.username}
      episodeNumbers={loaderData.episodeNumbers}
      rows={loaderData.rows}
    />
  );
}
