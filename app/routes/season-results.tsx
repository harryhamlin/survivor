// The "/season-results" route: the actual in-show record, episode by
// episode — who got voted out, who won immunity — as opposed to
// "/leaderboard", which is about fantasy players' predictions and scores.
// Requires being logged in, same as the other authenticated pages.
import type { Route } from "./+types/season-results";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { getCurrentSeason } from "../season.server";
import { SeasonResults } from "../components/SeasonResults";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "game_results" },
    { name: "description", content: "Actual episode-by-episode results" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);
  const userResult = await pool.query(
    "SELECT name, email FROM users WHERE id = $1",
    [userId],
  );
  const userRow = userResult.rows[0] as { name: string | null; email: string };
  const displayName = userRow.name ?? userRow.email;

  const season = await getCurrentSeason();
  if (!season) {
    return { displayName, episodes: [] };
  }

  const episodesResult = await pool.query(
    `SELECT e.id, e.episode_number, e.air_date, er.finalized_at
     FROM episodes e
     LEFT JOIN episode_results er ON er.episode_id = e.id
     WHERE e.season_id = $1
     ORDER BY e.episode_number`,
    [season.id],
  );

  // Both eliminations and immunity winners are zero-to-many per episode
  // (see episode_eliminations / episode_immunity_winners in
  // db/schema.sql), so each is its own query grouped into a per-episode
  // list below, rather than trying to fit a variable number of names into
  // one row per episode in SQL.
  const eliminationsResult = await pool.query(
    `SELECT ee.episode_id, c.name
     FROM episode_eliminations ee
     JOIN contestants c ON c.id = ee.contestant_id
     WHERE ee.episode_id IN (SELECT id FROM episodes WHERE season_id = $1)
     ORDER BY c.name`,
    [season.id],
  );
  const eliminatedByEpisodeId = new Map<number, string[]>();
  for (const row of eliminationsResult.rows) {
    const episodeId = row.episode_id as number;
    if (!eliminatedByEpisodeId.has(episodeId)) {
      eliminatedByEpisodeId.set(episodeId, []);
    }
    eliminatedByEpisodeId.get(episodeId)!.push(row.name as string);
  }

  // A winner row is either a tribe or a contestant (never both — see the
  // CHECK on episode_immunity_winners), so COALESCEing their names into one
  // column is enough to get a plain list of winner names either way.
  const immunityResult = await pool.query(
    `SELECT eiw.episode_id, COALESCE(t.name, c.name) AS name
     FROM episode_immunity_winners eiw
     LEFT JOIN tribes t ON t.id = eiw.tribe_id
     LEFT JOIN contestants c ON c.id = eiw.contestant_id
     WHERE eiw.episode_id IN (SELECT id FROM episodes WHERE season_id = $1)
     ORDER BY name`,
    [season.id],
  );
  const immunityWinnersByEpisodeId = new Map<number, string[]>();
  for (const row of immunityResult.rows) {
    const episodeId = row.episode_id as number;
    if (!immunityWinnersByEpisodeId.has(episodeId)) {
      immunityWinnersByEpisodeId.set(episodeId, []);
    }
    immunityWinnersByEpisodeId.get(episodeId)!.push(row.name as string);
  }

  const episodes = episodesResult.rows.map((row) => {
    const episodeId = row.id as number;
    return {
      episodeNumber: row.episode_number as number,
      airDate: row.air_date as Date | null,
      finalized: row.finalized_at != null,
      eliminated: eliminatedByEpisodeId.get(episodeId) ?? [],
      immunityWinners: immunityWinnersByEpisodeId.get(episodeId) ?? [],
    };
  });

  return { displayName, episodes };
}

export default function SeasonResultsRoute({
  loaderData,
}: Route.ComponentProps) {
  return (
    <SeasonResults
      displayName={loaderData.displayName}
      episodes={loaderData.episodes}
    />
  );
}
