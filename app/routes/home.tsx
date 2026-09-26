// The "/" route: a public leaderboard anyone can see without logging in,
// with a way to log in (or jump to the dashboard, if already signed in).
import type { Route } from "./+types/home";
import pool from "../db.server";
import { getUserId } from "../session.server";
import { getCurrentSeason } from "../season.server";
import { Leaderboard } from "../components/Leaderboard";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "fantasy survivor 51" },
    { name: "description", content: "Season leaderboard" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  // Unlike requireUserId, this never redirects — the page works either way.
  const userId = await getUserId(request);

  const season = await getCurrentSeason();
  if (!season) {
    return { standings: [], isLoggedIn: userId !== null };
  }

  // A LEFT JOIN all the way through (rather than an inner join) is what
  // includes players who haven't drafted yet, at a score of 0, instead of
  // silently leaving them off the board entirely. The score is the same
  // final-3 rule computed in full on /leaderboard (see that route's loader
  // for the reasoning) — just without the per-episode pick history.
  const result = await pool.query(
    `SELECT
       u.username,
       COALESCE(SUM(
         CASE WHEN c.final_placement IS NOT NULL AND c.final_placement <= $2
           THEN 4 ELSE 0 END
       ), 0)
       + COALESCE(MAX(
           CASE WHEN dp.is_ultimate_pick AND c.final_placement = 1 THEN 4 ELSE 0 END
         ), 0) AS score
     FROM users u
     JOIN fantasy_players fp ON fp.user_id = u.id
     LEFT JOIN draft_picks dp ON dp.player_id = fp.id AND dp.season_id = $1
     LEFT JOIN contestants c ON c.id = dp.contestant_id
     GROUP BY u.id, u.username
     ORDER BY score DESC, u.username ASC`,
    [season.id, season.finalistCount],
  );
  const standings = result.rows.map((row) => ({
    username: row.username as string,
    score: Number(row.score),
  }));

  return { standings, isLoggedIn: userId !== null };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { standings, isLoggedIn } = loaderData;
  return <Leaderboard standings={standings} isLoggedIn={isLoggedIn} />;
}
