import { randomUUID } from "node:crypto";
import { useState } from "react";
import { data, Form, redirect, useFetcher } from "react-router";
import type { Route } from "./+types/training-record";
import { editLockedDay, getLockedDay, listExercises, recordSession, requireTrainingUser, workoutName } from "../training/data.server";
import { defaultLoggedSets, formatDate, maxLoggedSets, trainingPath, unitLabels } from "../training/model";
import { BackLink, ExerciseOptions, FormMessage, PageTitle, SaveButton, ExerciseAuthor } from "../training/ui";
import { readFormData } from "../security.server";

export const meta = ({ loaderData }: Route.MetaArgs) => [{ title: (loaderData?.name ?? "Log session") + " | Torchsnuffers Training" }];
export async function loader({ request, params }: Route.LoaderArgs) {
  const userId = await requireTrainingUser(request);
  const [day, exercises] = await Promise.all([getLockedDay(userId, params.date), listExercises(userId)]);
  return { day, name: workoutName(day), exercises, submission: randomUUID() };
}
export async function action({ request, params }: Route.ActionArgs) {
  const userId = await requireTrainingUser(request);
  const form = await readFormData(request);
  if (form.get("intent") === "record") {
    const error = await recordSession(userId, params.date, form);
    if (error) return data({ error }, { status: 400 });
    return redirect(trainingPath + "/log");
  }
  const error = await editLockedDay(userId, params.date, form);
  return error ? data({ error }, { status: 400 }) : null;
}

export default function Record({ loaderData: { day, name, exercises, submission }, actionData }: Route.ComponentProps) {
  const [extraSets, setExtraSets] = useState<Record<string, number>>({});
  const edit = useFetcher<typeof action>();
  const editing = edit.state !== "idle";
  const change = (fields: Record<string, string | number>) => edit.submit(fields, { method: "post" });
  const available = exercises.filter(e => !day.exercises.some(m => m.id === e.id));
  return <div className="mx-auto max-w-lg"><BackLink/>
    <PageTitle title={name}/><p className="tr-intro">{formatDate(day.date)} · Swap or add exercises as you go. Leave unperformed sets blank.</p>
    <FormMessage error={edit.data?.error}/>
    <Form method="post" className="tr-form"><input name="submission" type="hidden" value={submission}/>
      <input name="intent" type="hidden" value="record"/>
      <label>Training date<input type="date" name="date" required defaultValue={day.date}/></label>
      {!day.exercises.length && <p className="tr-empty">{day.kind === "Rest" ? "Rest day. Add an exercise below if you train anyway." : "No exercises planned. Add one below."}</p>}
      {day.exercises.map(m => {
        const key = m.position + "-" + m.id;
        const sets = defaultLoggedSets + (extraSets[key] ?? 0);
        // Keyed by exercise so a swap starts with empty sets while the other exercises keep what you typed.
        return <fieldset className="tr-fieldset" key={key}><legend>{m.name}</legend>
          <input type="hidden" name={"exercise-" + m.position} value={m.id}/>
          <ExerciseAuthor name={m.author_name}/>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <label className="min-w-0 flex-1">Swap for<select value={m.id} disabled={editing}
              onChange={e => change({ intent: "swap", position: m.position, exercise: e.target.value })}>
              <option value={m.id}>{m.name}</option><ExerciseOptions exercises={available}/>
            </select></label>
            <button type="button" className="tr-text-link mb-2" disabled={editing} aria-label={"Remove " + m.name}
              onClick={() => change({ intent: "remove", position: m.position })}>Remove</button>
          </div>
          <div className="tr-set-head" aria-hidden="true"><span>Set</span><span>{unitLabels[m.unit]}</span><span>Weight (lb)</span></div>
          {Array.from({ length: sets }, (_, index) => {
            const field = m.position + "-" + (index + 1);
            return <div className="tr-set" key={field}><span>{index + 1}</span>
              <input aria-label={m.name + " set " + (index + 1) + " " + m.unit} name={"quantity-" + field} type="number" min={1} max={3600}/>
              <input aria-label={m.name + " set " + (index + 1) + " weight in pounds"} name={"weight-" + field} type="number" min={0} max={5000} step="any" placeholder="Optional"/>
            </div>;
          })}
          {sets < maxLoggedSets &&
            <button className="tr-text-link" type="button" aria-label={"Add a set to " + m.name}
              onClick={() => setExtraSets(current => ({ ...current, [key]: (current[key] ?? 0) + 1 }))}>+ Add set</button>}
        </fieldset>;
      })}
      {available.length > 0 && <label>Add exercise<select value="" disabled={editing}
        onChange={e => change({ intent: "add", exercise: e.target.value })}>
        <option value="" disabled>Choose exercise</option><ExerciseOptions exercises={available}/>
      </select></label>}
      <label>Session notes (optional)<textarea name="notes" rows={3} maxLength={1000}/></label>
      <FormMessage error={actionData?.error}/><SaveButton>Save session</SaveButton>
    </Form></div>;
}
