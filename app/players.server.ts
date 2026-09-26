// Bridges a login (users) to its game identity (fantasy_players). Kept as
// its own upsert rather than a schema-level trigger, per this app's
// convention of keeping logic out of the schema and in the backend.
import pool from "./db.server";

export type FantasyPlayer = { id: number; displayName: string };

// Ensures a fantasy_players row exists for this login, creating one on
// first use. Called right after signup, and defensively on every dashboard
// visit so a login that predates fantasy_players (e.g. a seeded account)
// still gets one. `ON CONFLICT (user_id)` is what makes this idempotent —
// user_id is UNIQUE on fantasy_players (see db/schema.sql), so a repeat call
// just returns the existing row instead of erroring or duplicating it.
export async function getOrCreateFantasyPlayer(
  userId: number,
  defaults: { displayName: string; email: string | null },
): Promise<FantasyPlayer> {
  const {
    rows: [player],
  } = await pool.query(
    `INSERT INTO fantasy_players (display_name, email, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING id, display_name`,
    [defaults.displayName, defaults.email, userId],
  );
  return { id: player.id as number, displayName: player.display_name as string };
}
