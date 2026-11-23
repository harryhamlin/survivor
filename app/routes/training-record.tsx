import { randomUUID } from "node:crypto";
import { useEffect, useState } from "react";
import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/training-record";
import { getWorkout, recordSession, requireTrainingUser } from "../training/data.server";
import { maxLoggedSets, trainingPath, unitLabels } from "../training/model";
import { BackLink, FormMessage, PageTitle, SaveButton, ExerciseAuthor } from "../training/ui";
import { readFormData } from "../security.server";

export const meta = () => [{ title: "Log session | Torchsnuffers Training" }];
export async function loader({ request, params }: Route.LoaderArgs) {
  const userId = await requireTrainingUser(request);
  return { ...await getWorkout(params.workoutId, userId), submission: randomUUID(), today: new Date().toISOString().slice(0, 10) };
}
export async function action({ request, params }: Route.ActionArgs) {
  const userId = await requireTrainingUser(request);
  const error = await recordSession(userId, params.workoutId, await readFormData(request));
  if (error) return data({ error }, { status: 400 });
  return redirect(trainingPath + "/log");
}
export default function Record({ loaderData: { workout, movements, submission, today }, actionData }: Route.ComponentProps) {
  const [extraSets, setExtraSets] = useState<Record<number, number>>({});
  const [date, setDate] = useState(today);
  useEffect(() => {
    const now = new Date();
    setDate(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10));
  }, []);
  return <div className="mx-auto max-w-lg"><BackLink to={trainingPath + "/" + workout.id}>{workout.name}</BackLink>
    <PageTitle title="Log session"/><p className="tr-intro">{workout.name} · Leave unperformed sets blank.</p>
    <Form method="post" className="tr-form"><input name="submission" type="hidden" value={submission}/>
      <label>Training date<input type="date" name="date" required value={date} onChange={e => setDate(e.target.value)}/></label>
      {movements.map(m => <fieldset className="tr-fieldset" key={m.position}><legend>{m.name}</legend>
        <ExerciseAuthor name={m.author_name}/>
        <p className="tr-muted">Plan · {m.sets} × {m.target} {m.unit}</p>
        <div className="tr-set-head" aria-hidden="true"><span>Set</span><span>{unitLabels[m.unit]}</span><span>Weight (lb)</span></div>
        {Array.from({ length: m.sets + (extraSets[m.position] ?? 0) }, (_, index) => {
          const key = m.position + "-" + (index + 1);
          return <div className="tr-set" key={key}><span>{index + 1}</span>
            <input aria-label={m.name + " set " + (index + 1) + " " + m.unit} name={"quantity-" + key} type="number" min={1} max={3600} placeholder={String(m.target)} />
            <input aria-label={m.name + " set " + (index + 1) + " weight in pounds"} name={"weight-" + key} type="number" min={0} max={5000} step="any" placeholder="Optional"/>
          </div>;
        })}
        {m.sets + (extraSets[m.position] ?? 0) < maxLoggedSets &&
          <button className="tr-text-link" type="button" aria-label={"Add a set to " + m.name}
            onClick={() => setExtraSets(current => ({ ...current, [m.position]: (current[m.position] ?? 0) + 1 }))}>+ Add set</button>}
      </fieldset>)}
      <label>Session notes (optional)<textarea name="notes" rows={3} maxLength={1000}/></label>
      <FormMessage error={actionData?.error}/><SaveButton>Save session</SaveButton>
    </Form></div>;
}
