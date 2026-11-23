import { useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/training-exercises";
import { getUserId } from "../session.server";
import { listExercises } from "../training/data.server";
import { trainingPath } from "../training/model";
import { PageTitle, LibraryTools } from "../training/ui";

export const meta = () => [{ title: "Exercise library | Torchsnuffers Training" }];
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserId(request);
  return { exercises: await listExercises(user), signedIn: user !== null };
}

export default function Exercises({ loaderData: { exercises, signedIn } }: Route.ComponentProps) {
  const [query, setQuery] = useState("");
  const [personal, setPersonal] = useState(false);
  const visible = exercises.filter(e => (!personal || e.personal) &&
    [e.name, e.equipment, e.focus].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <PageTitle title="Exercise library"><Link className="tr-button" to={trainingPath + "/exercises/new"}><span aria-hidden="true">+</span> Add exercise</Link></PageTitle>
    <LibraryTools {...{ query, setQuery, personal, setPersonal, signedIn }} noun="exercises"/>
    <div className="tr-list">{visible.map(e => <details key={e.id} className="tr-item">
      <summary><strong>{e.name}</strong><span>{e.equipment}</span><span>{e.focus}</span></summary>
      <div className="tr-item-body"><p>{e.cue}</p><p className="tr-muted">Track in {e.unit}{e.personal ? " · Personal exercise" : ""}</p></div>
    </details>)}</div>
    {!visible.length && <p className="tr-empty">{query ? "No exercises match your search." : "Your saved exercises will appear here."}</p>}
  </>;
}
