// The app's one scoring rule, computed live from the database rather than
// stored — see ScoringMetricsModal for how it's presented to players. Both
// "/" (home.tsx) and "/leaderboard" (leaderboard.tsx) need a player's score
// but query different additional data alongside it (a bare username vs. a
// full roster + pick history), so this only computes the score itself;
// callers join it against whatever else they need by player id.
import pool from "./db.server";

export type PlayerScore = { playerId: number; score: number };

// One row per fantasy player in the season, even one with no draft yet (at
// score 0) — a LEFT JOIN all the way from fantasy_players is what keeps
// them in the results. The rule itself: +4 per drafted contestant who
// reaches the season's final `finalist_count` (contestants.final_placement
// <= finalist_count), +4 more if the Ultimate Survivor pick specifically
// wins the season (final_placement = 1). Both thresholds come straight from
// the season/contestant data, so editing final_placement by hand updates
// every score immediately — nothing here is cached.
export async function getSeasonScores(
  seasonId: number,
  finalistCount: number,
): Promise<PlayerScore[]> {
  const { rows } = await pool.query(
    `SELECT
       fp.id AS player_id,
       COALESCE(SUM(
         CASE WHEN c.final_placement IS NOT NULL AND c.final_placement <= $2
           THEN 4 ELSE 0 END
       ), 0)
       + COALESCE(MAX(
           CASE WHEN dp.is_ultimate_pick AND c.final_placement = 1 THEN 4 ELSE 0 END
         ), 0) AS score
     FROM fantasy_players fp
     LEFT JOIN draft_picks dp ON dp.player_id = fp.id AND dp.season_id = $1
     LEFT JOIN contestants c ON c.id = dp.contestant_id
     GROUP BY fp.id`,
    [seasonId, finalistCount],
  );
  return rows.map((row) => ({
    playerId: row.player_id as number,
    score: Number(row.score),
  }));
}
