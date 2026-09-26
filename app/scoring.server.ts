// The app's scoring rules, computed live from the database rather than
// stored — see ScoringMetricsModal for how they're presented to players.
// Both "/" (home.tsx) and "/leaderboard" (leaderboard.tsx) need a player's
// total score but query different additional data alongside it (a bare
// name vs. a full roster + pick history), so this only computes the score
// itself; callers join it against whatever else they need by player id.
//
// The rules themselves are plain JS rather than SQL aggregates — a couple
// of `if`s read (and extend) more easily than a CASE/SUM expression, and at
// this app's scale fetching each player's raw rows and summing them here
// costs nothing.
import pool from "./db.server";

export type PlayerScore = { playerId: number; score: number };

type DraftPick = {
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
  const finalThreeScores = await getFinalThreeScores(seasonId, finalistCount);
  const weeklyPickScores = await getWeeklyPickScores(seasonId);
  const weeklyScoreByPlayerId = new Map(
    weeklyPickScores.map((s) => [s.playerId, s.score]),
  );
  return finalThreeScores.map((s) => ({
    playerId: s.playerId,
    score: s.score + (weeklyScoreByPlayerId.get(s.playerId) ?? 0),
  }));
}

async function getFinalThreeScores(
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

// An episode's actual outcome — null wherever that outcome isn't finalized
// yet, which is what makes a pick against it neither correct nor incorrect
// (see isEliminationPickCorrect/isImmunityPickCorrect below).
export type EpisodeResult = {
  eliminatedContestantId: number | null;
  winningTribeId: number | null;
  immunityContestantId: number | null;
};

export type WeeklyPick = {
  eliminationPickId: number;
  immunityTribePickId: number | null;
  immunityContestantPickId: number | null;
};

// Whether a player's elimination pick matches the episode's actual boot.
// Null means "not decided yet" (the result isn't finalized) — shared by the
// scoring below and the leaderboard's green/red pick coloring, so "what
// counts as correct" is defined in exactly one place.
export function isEliminationPickCorrect(
  pick: WeeklyPick,
  result: EpisodeResult | null,
): boolean | null {
  if (!result) return null;
  return pick.eliminationPickId === result.eliminatedContestantId;
}

// Same idea for the immunity pick — which field it's checked against
// depends on the episode's immunity_type (see db/schema.sql).
export function isImmunityPickCorrect(
  pick: WeeklyPick,
  result: EpisodeResult | null,
  immunityType: "tribe" | "individual",
): boolean | null {
  if (!result) return null;
  return immunityType === "tribe"
    ? result.winningTribeId !== null &&
        pick.immunityTribePickId === result.winningTribeId
    : result.immunityContestantId !== null &&
        pick.immunityContestantPickId === result.immunityContestantId;
}

async function getWeeklyPickScores(seasonId: number): Promise<PlayerScore[]> {
  const {
    rows: [{ count: totalContestants }],
  } = await pool.query(
    "SELECT count(*)::int AS count FROM contestants WHERE season_id = $1",
    [seasonId],
  );

  const { rows: episodeRows } = await pool.query(
    `SELECT id, episode_number, immunity_type FROM episodes
     WHERE season_id = $1
     ORDER BY episode_number`,
    [seasonId],
  );

  const { rows: resultRows } = await pool.query(
    `SELECT episode_id, eliminated_contestant_id, winning_tribe_id, immunity_contestant_id
     FROM episode_results
     WHERE finalized_at IS NOT NULL
       AND episode_id IN (SELECT id FROM episodes WHERE season_id = $1)`,
    [seasonId],
  );
  const resultByEpisodeId = new Map<number, EpisodeResult>(
    resultRows.map((row) => [
      row.episode_id as number,
      {
        eliminatedContestantId: row.eliminated_contestant_id as number | null,
        winningTribeId: row.winning_tribe_id as number | null,
        immunityContestantId: row.immunity_contestant_id as number | null,
      },
    ]),
  );

  // How many contestants were still in the game right before each
  // episode's boot (so the person who just got voted out still counts) —
  // the season's roster size minus whoever was already eliminated in a
  // strictly earlier, finalized episode.
  const remainingCountByEpisodeId = new Map<number, number>();
  let remaining = totalContestants as number;
  for (const episode of episodeRows) {
    const episodeId = episode.id as number;
    remainingCountByEpisodeId.set(episodeId, remaining);
    const result = resultByEpisodeId.get(episodeId);
    if (result?.eliminatedContestantId != null) {
      remaining -= 1;
    }
  }

  const immunityTypeByEpisodeId = new Map(
    episodeRows.map((row) => [
      row.id as number,
      row.immunity_type as "tribe" | "individual",
    ]),
  );

  const { rows: pickRows } = await pool.query(
    `SELECT wp.player_id, wp.episode_id, wp.elimination_pick_id,
            wp.immunity_tribe_pick_id, wp.immunity_contestant_pick_id
     FROM weekly_picks wp
     JOIN episodes e ON e.id = wp.episode_id
     WHERE e.season_id = $1`,
    [seasonId],
  );

  const scoreByPlayerId = new Map<number, number>();
  for (const row of pickRows) {
    const episodeId = row.episode_id as number;
    const result = resultByEpisodeId.get(episodeId) ?? null;
    if (!result) continue;

    const playerId = row.player_id as number;
    const pick: WeeklyPick = {
      eliminationPickId: row.elimination_pick_id as number,
      immunityTribePickId: row.immunity_tribe_pick_id as number | null,
      immunityContestantPickId: row.immunity_contestant_pick_id as
        | number
        | null,
    };

    let points = 0;
    // Elimination pick: worth more early in the season, when more people
    // are still in the game and correctly guessing the boot is harder.
    if (isEliminationPickCorrect(pick, result)) {
      const remainingCount = remainingCountByEpisodeId.get(episodeId) ?? 0;
      points += Math.ceil(remainingCount / 4);
    }
    // Immunity pick: flat +1 for a tribe win (pre-merge), +3 for an
    // individual win (post-merge, harder to call with more people to pick
    // from at once, if not necessarily fewer choices).
    const immunityType = immunityTypeByEpisodeId.get(episodeId) ?? "tribe";
    if (isImmunityPickCorrect(pick, result, immunityType)) {
      points += immunityType === "tribe" ? 1 : 3;
    }

    scoreByPlayerId.set(playerId, (scoreByPlayerId.get(playerId) ?? 0) + points);
  }

  return Array.from(scoreByPlayerId, ([playerId, score]) => ({
    playerId,
    score,
  }));
}
