// The "/rules" route: the official rules document, in full. Requires being
// logged in, same as the other authenticated pages.
import type { Route } from "./+types/rules";
import pool from "../db.server";
import { requireUserId } from "../session.server";
import { Rules } from "../components/Rules";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "rules" },
    { name: "description", content: "Official rules" },
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

  return { displayName };
}

export default function RulesRoute({ loaderData }: Route.ComponentProps) {
  return <Rules displayName={loaderData.displayName} />;
}
