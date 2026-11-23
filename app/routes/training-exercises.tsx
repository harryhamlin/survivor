import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/training-exercises";
import { getUserId } from "../session.server";
import { listExercises } from "../training/data.server";
import { trainingPath } from "../training/model";
import { PageTitle, LibraryTools, FocusSummary, ExerciseAuthor, emptyFilters, matchesFilters } from "../training/ui";

export const meta = () => [{ title: "Exercise library | Torchsnuffers Training" }];
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserId(request);
  return { exercises: await listExercises(user), signedIn: user !== null };
}

export default function Exercises({ loaderData: { exercises, signedIn } }: Route.ComponentProps) {
  const [filters, setFilters] = useState(emptyFilters);
  const visible = exercises.filter(e => matchesFilters(e, filters, e.author_name));
  return <>
    <PageTitle title="Exercise library"><Link className="tr-button" to={trainingPath + "/exercises/new"}>Add exercise</Link></PageTitle>
    {exercises.length > 0 && <LibraryTools filters={filters} onChange={setFilters} noun="exercises"/>}
    {visible.length > 0 && <div className="tr-list">{visible.map(e => <details key={e.id} className="tr-item">
      <summary><strong>{e.name}</strong><ExerciseAuthor name={e.author_name}/></summary>
      <div className="tr-item-body"><p><FocusSummary {...e}/></p><p className="tr-muted">Track in {e.unit}</p></div>
    </details>)}</div>}
    {!visible.length && <p className="tr-empty">{exercises.length ? "No exercises match your filters." : signedIn ? "Add your first exercise to start your library." : "Log in to see your exercise library."}</p>}
  </>;
}
