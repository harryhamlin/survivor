import { useRef, useState } from "react";
import { data, Form, redirect } from "react-router";
import type { Route } from "./+types/training-new-workout";
import { createWorkout, listExercises, requireTrainingUser } from "../training/data.server";
import { trainingPath } from "../training/model";
import { BackLink, FocusField, FormMessage, PageTitle, SaveButton } from "../training/ui";
import { readFormData } from "../security.server";

export const meta = () => [{ title: "Create workout | Torchsnuffers Training" }];
export async function loader({ request }: Route.LoaderArgs) {
  return { exercises: await listExercises(await requireTrainingUser(request)) };
}
export async function action({ request }: Route.ActionArgs) {
  const userId = await requireTrainingUser(request);
  const result = await createWorkout(userId, await readFormData(request));
  if (result.error) return data({ error: result.error }, { status: 400 });
  return redirect(trainingPath + "/" + result.id);
}
export default function NewWorkout({ loaderData: { exercises }, actionData }: Route.ComponentProps) {
  const [rows, setRows] = useState([{ key: 0, exerciseId: exercises[0].id }]);
  const nextKey = useRef(1);
  return <div className="tr-editor"><BackLink/><PageTitle title="Create workout"/>
    <Form method="post" className="tr-form">
      <label>Workout name<input name="name" maxLength={80} required/></label>
      <div className="tr-pair"><FocusField/><label>Duration (minutes)<input name="minutes" type="number" min={1} max={600} required defaultValue={30}/></label></div>
      <label>Description (optional)<textarea name="description" maxLength={500} rows={2}/></label>
      <h2>Exercise plan</h2>
      {rows.map((row, i) => <fieldset key={row.key} className="tr-fieldset">
        <legend>Exercise {i + 1}</legend>
        <div className="tr-movement-fields"><label>Movement<select name="exercise" value={row.exerciseId}
          onChange={event => setRows(rows.map(r => r.key === row.key ? { ...r, exerciseId: event.target.value } : r))}>
          {exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label>Sets<input type="number" min={1} max={8} name="sets" required defaultValue={3}/></label>
        <label>{exercises.find(e => e.id === row.exerciseId)?.unit === "seconds" ? "Seconds" : "Reps"} per set
          <input type="number" min={1} max={3600} name="target" required defaultValue={10}/></label></div>
        {rows.length > 1 && <button type="button" className="tr-text-link" aria-label={"Remove exercise " + (i + 1)}
          onClick={() => setRows(rows.filter(r => r.key !== row.key))}>Remove</button>}
      </fieldset>)}
      {rows.length < 12 && <button type="button" className="tr-secondary" onClick={() =>
        setRows([...rows, { key: nextKey.current++, exerciseId: exercises[0].id }])}>+ Add movement</button>}
      <FormMessage error={actionData?.error}/><SaveButton>Save workout</SaveButton>
    </Form></div>;
}
