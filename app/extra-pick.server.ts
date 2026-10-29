import pool from "./db.server";

// Both the UI and the action require an explicit enable flag and a deadline.
export function isExtraPickOpen(season: {
  extraPickEnabled: boolean;
  extraPickLockAt: Date | null;
  draftLockAt: Date | null;
}, now = Date.now()) {
  return season.extraPickEnabled &&
    season.extraPickLockAt !== null && season.extraPickLockAt.getTime() > now &&
    season.draftLockAt !== null && season.draftLockAt.getTime() <= now;
}

export async function saveExtraPick(seasonId: number, playerId: number, contestantId: number) {
  if (!Number.isSafeInteger(contestantId) || contestantId <= 0) {
    return { error: "Select a contestant" };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize roster mutations and read the settings again inside the transaction.
    const { rows: seasons } = await client.query(
      `SELECT draft_team_size, extra_pick_enabled, extra_pick_lock_at, draft_lock_at
       FROM seasons WHERE id = $1 FOR UPDATE`, [seasonId],
    );
    const season = seasons[0];
    if (!season || !isExtraPickOpen({
      extraPickEnabled: season.extra_pick_enabled,
      extraPickLockAt: season.extra_pick_lock_at,
      draftLockAt: season.draft_lock_at,
    })) {
      throw new Error("The fourth-pick window is closed");
    }
    const { rows: picks } = await client.query(
      "SELECT contestant_id, is_extra_pick FROM draft_picks WHERE season_id = $1 AND player_id = $2",
      [seasonId, playerId],
    );
    const originals = picks.filter((pick) => !pick.is_extra_pick);
    if (originals.length !== season.draft_team_size) {
      throw new Error("You need an existing team to add a fourth contestant");
    }
    if (originals.some((pick) => pick.contestant_id === contestantId)) {
      throw new Error("That contestant is already on your team");
    }
    const { rows: contestants } = await client.query(
      `SELECT id FROM contestants c WHERE c.id = $1 AND c.season_id = $2
       AND NOT EXISTS (SELECT 1 FROM episode_eliminations ee WHERE ee.contestant_id = c.id)
       FOR UPDATE`, [contestantId, seasonId],
    );
    if (!contestants.length) throw new Error("Choose a contestant still in the game");
    // Only the extra pick can change. The original roster and Ultimate Survivor stay intact.
    await client.query(
      "DELETE FROM draft_picks WHERE season_id = $1 AND player_id = $2 AND is_extra_pick",
      [seasonId, playerId],
    );
    await client.query(
      `INSERT INTO draft_picks (season_id, player_id, contestant_id, is_ultimate_pick, is_extra_pick)
       VALUES ($1, $2, $3, false, true)`, [seasonId, playerId, contestantId],
    );
    await client.query("COMMIT");
    return { success: true };
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "";
    const validationErrors = [
      "The fourth-pick window is closed",
      "You need an existing team to add a fourth contestant",
      "That contestant is already on your team",
      "Choose a contestant still in the game",
    ];
    return { error: validationErrors.includes(message) ? message : "Could not save your fourth pick" };
  } finally {
    client.release();
  }
}
