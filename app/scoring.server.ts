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

// +4 for a drafted contestant who reaches the season's final
// `finalist_count`, +4 more if they're specifically the Ultimate Survivor
// pick and they win outright (final_placement 1). Shared by
// getFinalThreeScores (the season-wide total) and getPlayerScoreBreakdown
// (one player's own breakdown), so this rule exists in exactly one place.
function scoreFinalThreePick(pick: DraftPick, finalistCount: number): number {
  let points = 0;
  if (pick.finalPlacement !== null && pick.finalPlacement <= finalistCount) {
    points += 4;
  }
  if (pick.isUltimatePick && pick.finalPlacement === 1) {
    points += 4;
  }
  return points;
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
    const score = picks.reduce(
      (sum, pick) => sum + scoreFinalThreePick(pick, finalistCount),
      0,
    );
    return { playerId, score };
  });
}

export type ScoringStatus = "pending" | "active" | "void";

// Everything a weekly pick needs to be graded against, for one episode:
// who actually got eliminated (zero, one, or several contestant ids), who
// actually won immunity (zero, one, or several tribe/contestant ids,
// matching `immunityType`), and each category's own scoring status — see
// episode_eliminations / episode_immunity_winners / episode_scoring in
// db/schema.sql.
export type EpisodeScoringInfo = {
  episodeNumber: number;
  immunityType: "tribe" | "individual";
  eliminationWinners: number[];
  eliminationStatus: ScoringStatus;
  immunityWinners: number[];
  immunityStatus: ScoringStatus;
};

// Fetches getEpisodeScoringInfo's data for every episode in a season.
// Shared by getWeeklyPickScores (which turns it into points) and the
// leaderboard route (which turns it into green/red pick coloring), so the
// actual "what happened, and does it count" facts are fetched in exactly
// one place rather than each caller re-querying episode_eliminations /
// episode_immunity_winners / episode_scoring itself.
export async function getEpisodeScoringInfo(
  seasonId: number,
): Promise<Map<number, EpisodeScoringInfo>> {
  const { rows: episodeRows } = await pool.query(
    `SELECT id, episode_number, immunity_type FROM episodes WHERE season_id = $1`,
    [seasonId],
  );

  const infoByEpisodeId = new Map<number, EpisodeScoringInfo>();
  for (const row of episodeRows) {
    infoByEpisodeId.set(row.id as number, {
      episodeNumber: row.episode_number as number,
      immunityType: row.immunity_type as "tribe" | "individual",
      eliminationWinners: [],
      eliminationStatus: "pending",
      immunityWinners: [],
      immunityStatus: "pending",
    });
  }

  // Zero, one, or many rows per episode — see episode_eliminations in
  // db/schema.sql.
  const { rows: eliminationRows } = await pool.query(
    `SELECT episode_id, contestant_id FROM episode_eliminations
     WHERE episode_id IN (SELECT id FROM episodes WHERE season_id = $1)`,
    [seasonId],
  );
  for (const row of eliminationRows) {
    infoByEpisodeId
      .get(row.episode_id as number)
      ?.eliminationWinners.push(row.contestant_id as number);
  }

  // Also zero, one, or many rows per episode — exactly one of tribe_id/
  // contestant_id is set per row (enforced by a CHECK in the schema), so
  // collecting whichever one is non-null into a single list is safe.
  const { rows: immunityRows } = await pool.query(
    `SELECT episode_id, tribe_id, contestant_id FROM episode_immunity_winners
     WHERE episode_id IN (SELECT id FROM episodes WHERE season_id = $1)`,
    [seasonId],
  );
  for (const row of immunityRows) {
    const info = infoByEpisodeId.get(row.episode_id as number);
    const winnerId = (row.tribe_id ?? row.contestant_id) as number;
    info?.immunityWinners.push(winnerId);
  }

  const { rows: scoringRows } = await pool.query(
    `SELECT episode_id, category, status FROM episode_scoring
     WHERE episode_id IN (SELECT id FROM episodes WHERE season_id = $1)`,
    [seasonId],
  );
  for (const row of scoringRows) {
    const info = infoByEpisodeId.get(row.episode_id as number);
    if (!info) continue;
    if (row.category === "elimination") {
      info.eliminationStatus = row.status as ScoringStatus;
    } else {
      info.immunityStatus = row.status as ScoringStatus;
    }
  }

  return infoByEpisodeId;
}

// The one place "does this prediction score points" is decided.
//   'pending' — not graded yet: null, not zero, so it stays visibly
//               distinct from "graded and wrong" to any caller that cares.
//   'void'    — this category doesn't count this episode at all: zero
//               regardless of the actual outcome or what was predicted.
//   'active'  — points if the prediction is among the actual winners,
//               zero otherwise. `prediction` can be null (an episode with
//               no elimination, say) — never a match, so this correctly
//               falls through to zero rather than needing a special case.
export function scorePrediction(
  status: ScoringStatus,
  prediction: number | null,
  winners: number[],
  points: number,
): number | null {
  if (status === "pending") return null;
  if (status === "void") return 0;
  return prediction !== null && winners.includes(prediction) ? points : 0;
}

// Whether a prediction was actually right — for display (the leaderboard's
// green/red pick coloring), not points. Void and pending both read as "not
// decided" (null) here, since neither should render as if it were wrong.
export function isPredictionCorrect(
  status: ScoringStatus,
  prediction: number | null,
  winners: number[],
): boolean | null {
  if (status !== "active") return null;
  return prediction !== null && winners.includes(prediction);
}

// How many contestants were still in the game right before each episode's
// boot(s) — so anyone voted out *that* episode still counts — the season's
// roster size minus however many were already eliminated in strictly
// earlier episodes. A multi-boot episode decrements by however many it
// eliminated, not just one. Shared by getWeeklyPickScores (the season-wide
// total) and getPlayerScoreBreakdown (one player's own breakdown).
async function getRemainingCountByEpisodeId(
  seasonId: number,
  infoByEpisodeId: Map<number, EpisodeScoringInfo>,
): Promise<Map<number, number>> {
  const {
    rows: [{ count: totalContestants }],
  } = await pool.query(
    "SELECT count(*)::int AS count FROM contestants WHERE season_id = $1",
    [seasonId],
  );
  const episodesInOrder = Array.from(infoByEpisodeId.entries()).sort(
    (a, b) => a[1].episodeNumber - b[1].episodeNumber,
  );

  const remainingCountByEpisodeId = new Map<number, number>();
  let remaining = totalContestants as number;
  for (const [episodeId, info] of episodesInOrder) {
    remainingCountByEpisodeId.set(episodeId, remaining);
    remaining -= info.eliminationWinners.length;
  }
  return remainingCountByEpisodeId;
}

async function getWeeklyPickScores(seasonId: number): Promise<PlayerScore[]> {
  const infoByEpisodeId = await getEpisodeScoringInfo(seasonId);
  const remainingCountByEpisodeId = await getRemainingCountByEpisodeId(
    seasonId,
    infoByEpisodeId,
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
    const info = infoByEpisodeId.get(episodeId);
    if (!info) continue;

    const playerId = row.player_id as number;
    const eliminationPickId = row.elimination_pick_id as number | null;
    const immunityPickId = (
      info.immunityType === "tribe"
        ? row.immunity_tribe_pick_id
        : row.immunity_contestant_pick_id
    ) as number | null;
    const remainingCount = remainingCountByEpisodeId.get(episodeId) ?? 0;

    // Elimination pick: worth more early in the season, when more people
    // are still in the game and correctly guessing the boot is harder.
    const eliminationPoints = scorePrediction(
      info.eliminationStatus,
      eliminationPickId,
      info.eliminationWinners,
      Math.ceil(remainingCount / 4),
    );
    // Immunity pick: flat +1 for a tribe win (pre-merge), +3 for an
    // individual win (post-merge).
    const immunityPoints = scorePrediction(
      info.immunityStatus,
      immunityPickId,
      info.immunityWinners,
      info.immunityType === "tribe" ? 1 : 3,
    );

    const points = (eliminationPoints ?? 0) + (immunityPoints ?? 0);
    scoreByPlayerId.set(playerId, (scoreByPlayerId.get(playerId) ?? 0) + points);
  }

  return Array.from(scoreByPlayerId, ([playerId, score]) => ({
    playerId,
    score,
  }));
}

export type WeeklyPickBreakdownRow = {
  episodeNumber: number;
  eliminationPickName: string | null;
  eliminationStatus: ScoringStatus;
  eliminationPoints: number | null;
  immunityPickName: string | null;
  immunityStatus: ScoringStatus;
  immunityPoints: number | null;
};

export type FinalThreeBreakdownRow = {
  contestantName: string;
  isUltimatePick: boolean;
  finalPlacement: number | null;
  points: number;
};

export type PlayerScoreBreakdown = {
  weeklyPicks: WeeklyPickBreakdownRow[];
  finalThree: FinalThreeBreakdownRow[];
  totalScore: number;
};

// One player's full score, broken down by every scored element — each
// episode's elimination and immunity picks, plus each drafted contestant's
// final-3 result — rather than just the single total getSeasonScores
// returns. Built from the same primitives (getEpisodeScoringInfo,
// getRemainingCountByEpisodeId, scorePrediction, scoreFinalThreePick) so a
// player's displayed breakdown always adds up to exactly what
// getSeasonScores counted for them.
export async function getPlayerScoreBreakdown(
  seasonId: number,
  playerId: number,
  finalistCount: number,
): Promise<PlayerScoreBreakdown> {
  const infoByEpisodeId = await getEpisodeScoringInfo(seasonId);
  const remainingCountByEpisodeId = await getRemainingCountByEpisodeId(
    seasonId,
    infoByEpisodeId,
  );

  const { rows: pickRows } = await pool.query(
    `SELECT
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
     WHERE wp.player_id = $1 AND e.season_id = $2
     ORDER BY e.episode_number`,
    [playerId, seasonId],
  );

  const weeklyPicks: WeeklyPickBreakdownRow[] = pickRows.map((row) => {
    const episodeId = row.episode_id as number;
    const info = infoByEpisodeId.get(episodeId);
    const eliminationPickId = row.elimination_pick_id as number | null;
    const immunityPickId = (
      info?.immunityType === "individual"
        ? row.immunity_contestant_pick_id
        : row.immunity_tribe_pick_id
    ) as number | null;
    const remainingCount = remainingCountByEpisodeId.get(episodeId) ?? 0;

    return {
      episodeNumber: row.episode_number as number,
      eliminationPickName: row.elimination_pick_name as string | null,
      eliminationStatus: info?.eliminationStatus ?? "pending",
      eliminationPoints: info
        ? scorePrediction(
            info.eliminationStatus,
            eliminationPickId,
            info.eliminationWinners,
            Math.ceil(remainingCount / 4),
          )
        : null,
      immunityPickName: row.immunity_pick_name as string | null,
      immunityStatus: info?.immunityStatus ?? "pending",
      immunityPoints: info
        ? scorePrediction(
            info.immunityStatus,
            immunityPickId,
            info.immunityWinners,
            info.immunityType === "tribe" ? 1 : 3,
          )
        : null,
    };
  });

  const { rows: draftRows } = await pool.query(
    `SELECT c.name, dp.is_ultimate_pick, c.final_placement
     FROM draft_picks dp
     JOIN contestants c ON c.id = dp.contestant_id
     WHERE dp.player_id = $1 AND dp.season_id = $2
     ORDER BY dp.is_ultimate_pick DESC, c.name`,
    [playerId, seasonId],
  );

  const finalThree: FinalThreeBreakdownRow[] = draftRows.map((row) => {
    const pick: DraftPick = {
      finalPlacement: row.final_placement as number | null,
      isUltimatePick: row.is_ultimate_pick as boolean,
    };
    return {
      contestantName: row.name as string,
      isUltimatePick: pick.isUltimatePick,
      finalPlacement: pick.finalPlacement,
      points: scoreFinalThreePick(pick, finalistCount),
    };
  });

  const totalScore =
    weeklyPicks.reduce(
      (sum, row) => sum + (row.eliminationPoints ?? 0) + (row.immunityPoints ?? 0),
      0,
    ) + finalThree.reduce((sum, row) => sum + row.points, 0);

  return { weeklyPicks, finalThree, totalScore };
}
