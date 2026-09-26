// Season/episode lookups shared by the dashboard, leaderboard, and home
// routes. Unlike the old deadlines.server.ts (which computed deadlines from
// a hardcoded constant with plain date arithmetic), lock times now live in
// the episodes table as real timestamptz values — this file just queries
// and formats them, it doesn't compute them.
import pool from "./db.server";

export type Season = {
  id: number;
  name: string;
  status: string;
  finalistCount: number;
};

export type Episode = {
  id: number;
  episodeNumber: number;
  picksLockAt: Date;
};

// The season fantasy players are currently drafting/predicting for. Falls
// back to the most recently created season if none is marked 'active', so
// the app still has something to show between seasons.
export async function getCurrentSeason(): Promise<Season | null> {
  const { rows } = await pool.query(
    `SELECT id, name, status, finalist_count FROM seasons
     ORDER BY (status = 'active') DESC, id DESC
     LIMIT 1`,
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as number,
    name: row.name as string,
    status: row.status as string,
    finalistCount: row.finalist_count as number,
  };
}

// The draft locks at the season's first episode's picks_lock_at. Null if
// that episode hasn't been entered yet, in which case the draft is treated
// as open (see isLocked below).
export async function getDraftLockAt(seasonId: number): Promise<Date | null> {
  const { rows } = await pool.query(
    `SELECT picks_lock_at FROM episodes
     WHERE season_id = $1 AND episode_number = 1`,
    [seasonId],
  );
  return rows[0]?.picks_lock_at ?? null;
}

// The next episode whose picks haven't locked yet — the one the weekly
// picks form should currently be open for. Null once every entered episode
// has locked (nothing left to predict until a new one is added).
export async function getCurrentEpisode(
  seasonId: number,
): Promise<Episode | null> {
  const { rows } = await pool.query(
    `SELECT id, episode_number, picks_lock_at FROM episodes
     WHERE season_id = $1 AND picks_lock_at > now()
     ORDER BY episode_number ASC
     LIMIT 1`,
    [seasonId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as number,
    episodeNumber: row.episode_number as number,
    picksLockAt: row.picks_lock_at as Date,
  };
}

export function isLocked(lockAt: Date | null): boolean {
  return lockAt !== null && Date.now() >= lockAt.getTime();
}

// A real stored instant can be formatted directly with Intl — no timezone
// hacks needed (contrast the old deadlines.server.ts, which had to fake a
// Pacific wall-clock Date because it computed a recurring deadline from
// scratch rather than reading a real one out of the database).
export function formatPacific(date: Date): string {
  return date.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}
