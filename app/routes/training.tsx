import { Form, Link, NavLink, Outlet, useLocation } from "react-router";
import type { Route } from "./+types/training";
import { getUserId, logout } from "../session.server";
import { trainingPath } from "../training/model";
import "../training/training.css";

export const headers = () => ({ "Cache-Control": "private, no-store" });

export async function loader({ request }: Route.LoaderArgs) {
  return { signedIn: (await getUserId(request)) !== null };
}

export function action({ request }: Route.ActionArgs) {
  return logout(request, trainingPath);
}

export default function Training({ loaderData }: Route.ComponentProps) {
  const { pathname } = useLocation();
  const exercisePath = trainingPath + "/exercises";
  const logPath = trainingPath + "/log";
  const workoutActive = !pathname.startsWith(exercisePath) && !pathname.startsWith(logPath) && !pathname.endsWith("/sign-in");
  return <div className="training-app">
    <header className="tr-header"><div className="tr-bar">
      <Link className="tr-brand" to={trainingPath}><span className="tr-brandmark" aria-hidden="true"><i/><i/><i/></span>Torchsnuffers<span className="tr-brand-sub">Training</span></Link>
      <nav aria-label="Training"><Link to={trainingPath} aria-current={workoutActive ? "page" : undefined}>Workouts</Link><NavLink to={exercisePath}>Exercises</NavLink><NavLink to={logPath}>Training log</NavLink></nav>
      <div className="tr-account">{loaderData.signedIn
        ? <Form action={trainingPath} method="post"><button type="submit">Sign out</button></Form>
        : <Link to={trainingPath + "/sign-in"}>Sign in</Link>}</div>
    </div></header>
    <main className="tr-main"><Outlet /></main>
  </div>;
}
