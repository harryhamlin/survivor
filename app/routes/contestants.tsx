// The "/contestants" route: a photo grid of the season's cast — one frame
// per contestant, bordered in their current tribe's color (or eliminated,
// if applicable). Requires being logged in, same as the other authenticated
// pages.
import type { Route } from "./+types/contestants";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { getCurrentSeason } from "../season.server";
import { ContestantsGrid } from "../components/ContestantsGrid";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "contestants" },
    { name: "description", content: "The season's cast" },
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
    return { displayName, contestants: [] };
  }

  // `eliminated` is derived from episode_eliminations (a contestant is out
  // once they show up there for any episode) — same as everywhere else that
  // needs this, see the comment on contestants.final_placement in
  // db/schema.sql. tribe_color is nullable: a contestant with no tribe_id
  // assigned yet (see the note on the seed data in db/schema.sql) just gets
  // the frame's neutral default border instead.
  const contestantsResult = await pool.query(
    `SELECT
       c.id,
       c.name,
       t.color AS tribe_color,
       EXISTS (
         SELECT 1 FROM episode_eliminations ee WHERE ee.contestant_id = c.id
       ) AS eliminated
     FROM contestants c
     LEFT JOIN tribes t ON t.id = c.tribe_id
     WHERE c.season_id = $1
     ORDER BY c.name`,
    [season.id],
  );
  const contestants = contestantsResult.rows.map((row) => ({
    id: row.id as number,
    name: row.name as string,
    tribeColor: row.tribe_color as string | null,
    eliminated: row.eliminated as boolean,
  }));

  return { displayName, contestants };
}

export default function ContestantsRoute({
  loaderData,
}: Route.ComponentProps) {
  return (
    <ContestantsGrid
      displayName={loaderData.displayName}
      contestants={loaderData.contestants}
    />
  );
}
