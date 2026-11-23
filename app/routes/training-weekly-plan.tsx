import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/training-weekly-plan";
import { readFormData } from "../security.server";
import { listExercises, listWeeklyPlan, requireTrainingUser, updateWeeklyPlan } from "../training/data.server";
import { trainingPath, weekdays } from "../training/model";
import { ExerciseAuthor, FormMessage, PageTitle } from "../training/ui";

export const meta = () => [{ title: "Weekly plan | Torchsnuffers Training" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireTrainingUser(request);
  const [exercises, entries] = await Promise.all([listExercises(user), listWeeklyPlan(user)]);
  return { exercises, entries };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireTrainingUser(request);
  const error = await updateWeeklyPlan(user, await readFormData(request));
  if (error) return data({ error }, { status: 400 });
  return redirect(trainingPath + "/weekly-plan");
}

export default function WeeklyPlan({ loaderData: { exercises, entries }, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  return <>
    <PageTitle title="Weekly plan"/>
    <p className="tr-intro">Your schedule repeats each week.</p>
    {exercises.length ? (
      <Form method="post" className="tr-form mb-8">
        <input type="hidden" name="intent" value="add"/>
        <div className="tr-pair">
          <label>Day<select name="day">{weekdays.map((day, index) =>
            <option key={day} value={index + 1}>{day}</option>)}</select></label>
          <label>Exercise<select name="exercise" required defaultValue="">
            <option value="" disabled>Choose exercise</option>
            {exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select></label>
        </div>
        <button className="tr-button" type="submit" disabled={busy}>Add to plan</button>
      </Form>
    ) : <p className="mb-6"><Link className="tr-text-link" to={trainingPath + "/exercises/new?next=weekly-plan"}>Add your first exercise</Link></p>}
    <FormMessage error={actionData?.error}/>
    <div className="tr-list">{weekdays.map((day, index) => {
      const dayNumber = index + 1;
      const planned = entries.filter(entry => entry.day_of_week === dayNumber);
      return <section key={day} className="p-4">
        <h2 className="font-semibold">{day}</h2>
        {planned.length ? <ul className="mt-2 space-y-2">{planned.map(entry => (
          <li key={entry.exercise_id} className="flex justify-between gap-4">
            <div className="min-w-0 break-words"><p>{entry.name}</p><ExerciseAuthor name={entry.author_name}/></div>
            <Form method="post">
              <input type="hidden" name="intent" value="remove"/>
              <input type="hidden" name="day" value={dayNumber}/>
              <input type="hidden" name="exercise" value={entry.exercise_id}/>
              <button type="submit" className="tr-text-link" disabled={busy} aria-label={"Remove " + entry.name + " from " + day}>Remove</button>
            </Form>
          </li>
        ))}</ul> : <p className="tr-muted">No exercises planned</p>}
      </section>;
    })}</div>
  </>;
}
