import { Outlet, useLocation, useMatch } from "react-router";
import type { Route } from "./+types/training";
import { MenuBanner } from "../components/TopBanner";
import pool from "../db.server";
import { getUserId, logout } from "../session.server";
import { trainingPath } from "../training/model";
import "../training/training.css";

const loginPath = trainingPath + "/sign-in";
const libraryLinks = [
  { to: trainingPath, label: "workout library" },
  { to: trainingPath + "/exercises", label: "exercise library" },
  { to: trainingPath + "/weekly-plan", label: "weekly plan" },
  { to: trainingPath + "/log", label: "training log" },
];

export const headers = () => ({ "Cache-Control": "private, no-store" });

export async function loader({ request }: Route.LoaderArgs) {
  const userId = await getUserId(request);
  if (userId === null) return { displayName: null };
  const { rows } = await pool.query<{ display_name: string }>(
    "SELECT COALESCE(name, email) AS display_name FROM users WHERE id = $1", [userId],
  );
  return { displayName: rows[0]?.display_name ?? null };
}

export function action({ request }: Route.ActionArgs) {
  return logout(request, trainingPath);
}

export default function Training({ loaderData: { displayName } }: Route.ComponentProps) {
  const { pathname } = useLocation();
  const isLogin = useMatch(loginPath);
  if (isLogin) return <Outlet />;

  const links = libraryLinks.filter(link => link.to !== pathname);
  if (displayName === null) links.push({ to: loginPath, label: "log in" });
  return (
    <main className="min-h-screen bg-background">
      <MenuBanner
        displayName={displayName ?? "Torchsnuffers training"}
        links={links}
        logoutAction={displayName === null ? undefined : trainingPath}
      />
      <div className="mx-auto max-w-2xl px-4 py-12"><Outlet /></div>
    </main>
  );
}
