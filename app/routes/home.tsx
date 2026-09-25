// The "/" route: a public leaderboard anyone can see without logging in,
// with a way to log in (or jump to the dashboard, if already signed in).
import type { Route } from "./+types/home";
import pool from "../db.server";
import { getUserId } from "../session.server";
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

  // A LEFT JOIN (rather than an inner join) is what includes users who
  // haven't picked a team yet, at a score of 0, instead of silently leaving
  // them off the board entirely.
  const result = await pool.query(
    `SELECT u.username, COALESCE(t.cumulative_score, 0) AS cumulative_score
     FROM users u
     LEFT JOIN teams t ON t.user_id = u.id
     ORDER BY cumulative_score DESC, u.username ASC`,
  );
  const standings = result.rows.map((row) => ({
    username: row.username as string,
    score: row.cumulative_score as number,
  }));

  return { standings, isLoggedIn: userId !== null };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { standings, isLoggedIn } = loaderData;
  return <Leaderboard standings={standings} isLoggedIn={isLoggedIn} />;
}
