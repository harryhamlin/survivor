// The app's one scoring rule, computed live from the database rather than
// stored — see ScoringMetricsModal for how it's presented to players. Both
// "/" (home.tsx) and "/leaderboard" (leaderboard.tsx) need a player's score
// but query different additional data alongside it (a bare username vs. a
// full roster + pick history), so this only computes the score itself;
// callers join it against whatever else they need by player id.
//
// The rule itself is plain JS rather than a SQL aggregate — a couple of
// `if`s read (and extend, e.g. once weekly picks get their own scoring)
// more easily than a CASE/SUM expression, and at this app's scale fetching
// each player's raw draft rows and summing them here costs nothing.
import pool from "./db.server";

export type PlayerScore = { playerId: number; score: number };

type DraftPick = {
  playerId: number;
  finalPlacement: number | null;
  isUltimatePick: boolean;
};

// One row per fantasy player, even one with no draft yet (at score 0) —
// starting from every fantasy_players row (rather than only ones with a
// draft_picks match) is what keeps them in the results.
export async function getSeasonScores(
  seasonId: number,
  finalistCount: number,
): Promise<PlayerScore[]> {
  const { rows: playerRows } = await pool.query(
    "SELECT id FROM fantasy_players",
  );
  const { rows: pickRows } = await pool.query(
    `SELECT dp.player_id, c.final_placement, dp.is_ultimate_pick
     FROM draft_picks dp
     JOIN contestants c ON c.id = dp.contestant_id
     WHERE dp.season_id = $1`,
    [seasonId],
  );

  const picksByPlayerId = new Map<number, DraftPick[]>();
  for (const row of pickRows) {
    const playerId = row.player_id as number;
    if (!picksByPlayerId.has(playerId)) {
      picksByPlayerId.set(playerId, []);
    }
    picksByPlayerId.get(playerId)!.push({
      playerId,
      finalPlacement: row.final_placement as number | null,
      isUltimatePick: row.is_ultimate_pick as boolean,
    });
  }

  return playerRows.map((row) => {
    const playerId = row.id as number;
    const picks = picksByPlayerId.get(playerId) ?? [];
    let score = 0;
    for (const pick of picks) {
      // +4 for each drafted contestant who reaches the season's final
      // `finalist_count`.
      if (pick.finalPlacement !== null && pick.finalPlacement <= finalistCount) {
        score += 4;
      }
      // +4 more if the Ultimate Survivor pick specifically wins the season.
      if (pick.isUltimatePick && pick.finalPlacement === 1) {
        score += 4;
      }
    }
    return { playerId, score };
  });
}
