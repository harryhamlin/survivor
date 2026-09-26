// The "/" route: a public leaderboard anyone can see without logging in,
// with a way to log in (or jump to the dashboard, if already signed in).
import type { Route } from "./+types/home";
import pool from "../db.server";
import { getUserId } from "../session.server";
import { getCurrentSeason } from "../season.server";
import { getSeasonScores } from "../scoring.server";
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

  const scores = await getSeasonScores(season.id, season.finalistCount);
  const scoreByPlayerId = new Map(scores.map((s) => [s.playerId, s.score]));

  const playersResult = await pool.query(
    `SELECT fp.id AS player_id, u.username
     FROM fantasy_players fp
     JOIN users u ON u.id = fp.user_id`,
  );
  const standings = playersResult.rows
    .map((row) => ({
      username: row.username as string,
      score: scoreByPlayerId.get(row.player_id as number) ?? 0,
    }))
    .sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));

  return { standings, isLoggedIn: userId !== null };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { standings, isLoggedIn } = loaderData;
  return <Leaderboard standings={standings} isLoggedIn={isLoggedIn} />;
}
