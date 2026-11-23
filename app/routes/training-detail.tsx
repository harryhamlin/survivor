import { Link } from "react-router";
import type { Route } from "./+types/training-detail";
import { getUserId } from "../session.server";
import { getWorkout } from "../training/data.server";
import { trainingPath } from "../training/model";
import { BackLink, PageTitle, WorkoutMeta, FocusSummary, ExerciseAuthor } from "../training/ui";

export const meta = ({ loaderData }: Route.MetaArgs) => [{ title: (loaderData?.workout.name ?? "Workout") + " | Torchsnuffers Training" }];
export async function loader({ request, params }: Route.LoaderArgs) {
  return getWorkout(params.workoutId, await getUserId(request));
}
export default function Detail({ loaderData: { workout, movements } }: Route.ComponentProps) {
  return <><BackLink/><PageTitle title={workout.name}><Link className="tr-button" to={trainingPath + "/" + workout.id + "/log"}>Log session</Link></PageTitle>
    <p><FocusSummary {...workout}/></p>{workout.description && <p className="tr-intro">{workout.description}</p>}<WorkoutMeta minutes={workout.minutes} count={movements.length}/>
    <section className="tr-section"><h2>Exercise plan</h2><ol className="tr-list">{movements.map(m =>
      <li key={m.position} className="tr-plan"><div><h3>{m.name}</h3><p><ExerciseAuthor name={m.author_name}/></p><p><FocusSummary {...m}/></p></div>
      <strong>{m.sets} × {m.target} {m.unit}</strong></li>)}</ol></section>
  </>;
}
