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
  const featured = workouts.find(workout => workout.id === "full-body-foundation");
  const visible = workouts.filter(w => (!personal || w.personal) &&
    (w.name + " " + w.focus).toLowerCase().includes(query.trim().toLowerCase()));
  return <>
    <PageTitle title="Workout library"><Link className="tr-button" to={trainingPath + "/new"}><span aria-hidden="true">+</span> Create workout</Link></PageTitle>
    {featured && <section className="tr-hero" aria-labelledby="featured-name">
      <div className="tr-hero-copy"><p className="tr-kicker"><span className="tr-line"/>Featured workout</p>
        <h2 id="featured-name">{featured.name}</h2>
        <WorkoutMeta minutes={featured.minutes} count={featured.count}/>
        <Link className="tr-hero-link" to={trainingPath + "/" + featured.id}>View workout</Link>
      </div>
    </section>}
    <LibraryTools {...{ personal, setPersonal, query, setQuery, signedIn }} noun="workouts"/>
    {visible.length ? <div className="tr-grid">{visible.map(w =>
      <Link to={trainingPath + "/" + w.id} key={w.id} className="tr-card">
        <p className="tr-kicker">{w.focus}{w.personal && " · Personal"}</p>
        <h2>{w.name}</h2><WorkoutMeta minutes={w.minutes} count={w.count} />
      </Link>
    )}</div> : <p className="tr-empty">{query ? "No workouts match your search." : "Your saved workouts will appear here."}</p>}
  </>;
}
