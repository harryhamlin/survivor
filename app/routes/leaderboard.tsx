// The "/leaderboard" route: a spreadsheet-style view — every fantasy
// player's draft and score, plus a column for each episode's
// elimination/immunity picks. Requires being logged in. Distinct from "/"'s
// public one-line-per-player standings summary (see home.tsx).
import type { Route } from "./+types/leaderboard";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { getCurrentSeason } from "../season.server";
import {
  getSeasonScores,
  getEpisodeScoringInfo,
  isPredictionCorrect,
} from "../scoring.server";
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
    "SELECT name, email FROM users WHERE id = $1",
    [userId],
  );
  const userRow = userResult.rows[0] as { name: string | null; email: string };
  const displayName = userRow.name ?? userRow.email;

  const season = await getCurrentSeason();
  if (!season) {
    return { displayName, episodeNumbers: [], rows: [] };
  }

  const scores = await getSeasonScores(season.id, season.finalistCount);
  const scoreByPlayerId = new Map(scores.map((s) => [s.playerId, s.score]));

  // One row per fantasy player, with their draft's contestant names
  // pre-aggregated into an array (ultimate pick first) plus that pick called
  // out on its own — LEFT JOINed all the way through so a player with no
  // draft yet still gets a row (empty team array, null ultimate pick). Also
  // joins back to users for `name`/`email`, used only to format the display
  // name below. Score itself comes from getSeasonScores above, not from
  // this query.
  const playersResult = await pool.query(
    `SELECT
       fp.id AS player_id,
       u.email,
       u.name,
       COALESCE(
         array_agg(c.name ORDER BY dp.is_ultimate_pick DESC, c.name)
           FILTER (WHERE c.name IS NOT NULL),
         ARRAY[]::text[]
       ) AS team_names,
       MAX(c.name) FILTER (WHERE dp.is_ultimate_pick) AS ultimate_pick_name
     FROM fantasy_players fp
     JOIN users u ON u.id = fp.user_id
     LEFT JOIN draft_picks dp ON dp.player_id = fp.id AND dp.season_id = $1
     LEFT JOIN contestants c ON c.id = dp.contestant_id
     GROUP BY fp.id, u.email, u.name`,
    [season.id],
  );

  // Actual outcomes + scoring status for every episode this season, shared
  // with getSeasonScores' point calculation (see getEpisodeScoringInfo in
  // scoring.server.ts) — used here to color each pick correct/incorrect.
  const infoByEpisodeId = await getEpisodeScoringInfo(season.id);

  // Every episode's picks, for every player, in one query — grouped into a
  // per-player map below rather than queried once per player per episode.
  // The two immunity joins are LEFT JOINs (and their names COALESCEd into
  // one) since only one of immunity_tribe_pick_id/immunity_contestant_pick_id
  // is ever set on a given row, depending on that episode's immunity_type.
  const picksResult = await pool.query(
    `SELECT
       wp.player_id,
       wp.episode_id,
       e.episode_number,
       wp.elimination_pick_id,
       c.name AS elimination_pick_name,
       wp.immunity_tribe_pick_id,
       wp.immunity_contestant_pick_id,
       COALESCE(t.name, ic.name) AS immunity_pick_name
     FROM weekly_picks wp
     JOIN episodes e ON e.id = wp.episode_id
     LEFT JOIN contestants c ON c.id = wp.elimination_pick_id
     LEFT JOIN tribes t ON t.id = wp.immunity_tribe_pick_id
     LEFT JOIN contestants ic ON ic.id = wp.immunity_contestant_pick_id
     WHERE e.season_id = $1
     ORDER BY wp.player_id ASC, e.episode_number ASC`,
    [season.id],
  );

  const picksByPlayerId = new Map<
    number,
    Map<
      number,
      {
        eliminationPickName: string | null;
        eliminationCorrect: boolean | null;
        immunityPickName: string | null;
        immunityCorrect: boolean | null;
      }
    >
  >();
  for (const row of picksResult.rows) {
    const playerId = row.player_id as number;
    const episodeId = row.episode_id as number;
    const info = infoByEpisodeId.get(episodeId);
    const eliminationPickId = row.elimination_pick_id as number | null;
    const immunityPickId = (
      info?.immunityType === "individual"
        ? row.immunity_contestant_pick_id
        : row.immunity_tribe_pick_id
    ) as number | null;

    if (!picksByPlayerId.has(playerId)) {
      picksByPlayerId.set(playerId, new Map());
    }
    picksByPlayerId.get(playerId)!.set(row.episode_number as number, {
      eliminationPickName: row.elimination_pick_name as string | null,
      eliminationCorrect: info
        ? isPredictionCorrect(
            info.eliminationStatus,
            eliminationPickId,
            info.eliminationWinners,
          )
        : null,
      immunityPickName: row.immunity_pick_name as string | null,
      immunityCorrect: info
        ? isPredictionCorrect(
            info.immunityStatus,
            immunityPickId,
            info.immunityWinners,
          )
        : null,
    });
  }

  const episodesResult = await pool.query(
    "SELECT episode_number FROM episodes WHERE season_id = $1 ORDER BY episode_number",
    [season.id],
  );
  const episodeNumbers = episodesResult.rows.map(
    (row) => row.episode_number as number,
  );

  const rows = playersResult.rows
    .map((row) => {
      const playerId = row.player_id as number;
      const picksByEpisode = picksByPlayerId.get(playerId);
      // Falls back to the email for a legacy/seeded account with no name
      // set — there's no more username to fall back to instead.
      const rowDisplayName =
        (row.name as string | null) ?? (row.email as string);
      return {
        playerId,
        displayName: rowDisplayName,
        score: scoreByPlayerId.get(playerId) ?? 0,
        team: row.team_names as string[],
        ultimatePick: row.ultimate_pick_name as string | null,
        picks: episodeNumbers.map(
          (episodeNumber) => picksByEpisode?.get(episodeNumber) ?? null,
        ),
      };
    })
    .sort(
      (a, b) => b.score - a.score || a.displayName.localeCompare(b.displayName),
    );

  return { displayName, episodeNumbers, rows };
}

export default function Leaderboard({ loaderData }: Route.ComponentProps) {
  return (
    <DetailedScores
      displayName={loaderData.displayName}
      episodeNumbers={loaderData.episodeNumbers}
      rows={loaderData.rows}
    />
  );
}
