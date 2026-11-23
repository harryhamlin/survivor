import { Link } from "react-router";
import { useState } from "react";
import type { Route } from "./+types/training-library";
import { getUserId } from "../session.server";
import { listWorkouts } from "../training/data.server";
import { trainingPath } from "../training/model";
import { PageTitle, LibraryTools, WorkoutMeta } from "../training/ui";

export const meta = () => [{ title: "Workout library | Torchsnuffers Training" }];
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserId(request);
  return { workouts: await listWorkouts(user), signedIn: user !== null };
}

export default function Library({ loaderData: { workouts, signedIn } }: Route.ComponentProps) {
  const [query, setQuery] = useState("");
  const [personal, setPersonal] = useState(false);
  const visible = workouts.filter(w => (!personal || w.personal) &&
    (w.name + " " + w.focus).toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <PageTitle title="Workout library">
      <Link className="tr-button" to={trainingPath + "/new"}>Create workout</Link>
    </PageTitle>
    <LibraryTools {...{ personal, setPersonal, query, setQuery, signedIn }} noun="workouts"/>
    {visible.length ? (
      <ul className="tr-list">
        {visible.map(w => (
          <li key={w.id}>
            <Link to={trainingPath + "/" + w.id} className="flex flex-col items-start gap-x-4 gap-y-1 px-4 py-3 hover:bg-primary/10 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="break-words font-medium">{w.name}</span>
                <p className="tr-muted">{w.focus}{w.personal && " · personal"}</p>
              </div>
              <WorkoutMeta minutes={w.minutes} count={w.count} />
            </Link>
          </li>
        ))}
      </ul>
    ) : <p className="tr-empty">{query ? "No workouts match your search." : "Your saved workouts will appear here."}</p>}
  </>;
}
