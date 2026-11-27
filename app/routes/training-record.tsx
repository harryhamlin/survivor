import { useState } from "react";
import { data, Form, redirect, useFetcher } from "react-router";
import type { Route } from "./+types/training-record";
import { editLockedDay, loadSessionForm, recordSession, requireTrainingUser } from "../training/data.server";
import { formatDate, logExercise, maxLoggedSets, trainingPath, unitLabels, type LogRow } from "../training/model";
import { BackLink, ExerciseOptions, FormMessage, PageTitle, SaveButton, ExerciseAuthor } from "../training/ui";
import { readFormData } from "../security.server";

export const meta = ({ loaderData }: Route.MetaArgs) => [{ title: (loaderData?.name ?? "Log session") + " | Torchsnuffers Training" }];
export async function loader({ request, params }: Route.LoaderArgs) {
  const userId = await requireTrainingUser(request);
  return loadSessionForm(userId, params.date);
}
export async function action({ request, params }: Route.ActionArgs) {
  const userId = await requireTrainingUser(request);
  const form = await readFormData(request);
  if (form.get("intent") === "record" || form.get("intent") === "update") {
    const error = await recordSession(userId, params.date, form);
    if (error) return data({ error }, { status: 400 });
    return redirect(trainingPath + "/log");
  }
  const error = await editLockedDay(userId, params.date, form);
  return error ? data({ error }, { status: 400 }) : null;
}

export default function Record(props: Route.ComponentProps) {
  return <SessionForm key={props.loaderData.day.date + (props.loaderData.saved ? "-saved" : "")} {...props}/>;
}

function SessionForm({ loaderData: { day, name, exercises, rows, saved, previous }, actionData }: Route.ComponentProps) {
  const [draft, setDraft] = useState<LogRow[] | null>(null);
  const movements = draft ?? rows;
  const [extraSets, setExtraSets] = useState<Record<string, number>>({});
  const edit = useFetcher<typeof action>();
  const editing = edit.state !== "idle";
  function change(intent: "add" | "swap" | "remove", position: number, exercise?: string) {
    if (!saved) {
      edit.submit({ intent, position, exercise: exercise ?? "" }, { method: "post" });
      return;
    }
    if (intent === "remove") {
      setDraft(movements.filter(m => m.position !== position));
      return;
    }
    const selected = exercises.find(e => e.id === exercise);
    if (!selected) return;
    const move = { ...logExercise(selected), position };
    setDraft(intent === "add" ? [...movements, move] : movements.map(m => m.position === position ? move : m));
  }
  const available = exercises.filter(e => !movements.some(m => m.id === e.id));
  return <div className="mx-auto max-w-lg"><BackLink/>
    <PageTitle title={name}/><p className="tr-intro">{formatDate(day.date)} · Edit your prefilled sets or add more. Clear both fields for any set you skip.</p>
    <FormMessage error={edit.data?.error}/>
    <Form method="post" className="tr-form">
      <input name="intent" type="hidden" value={saved ? "update" : "record"}/>
      <label>Training date<input type="date" name="date" required defaultValue={saved?.date ?? day.date}/></label>
      {!movements.length && <p className="tr-empty">{day.kind === "Rest" ? "Rest day. Add an exercise below if you train anyway." : "No exercises planned. Add one below."}</p>}
      {movements.map(m => {
        const key = day.date + "-" + m.position + "-" + m.id;
        const last = previous[m.id];
        const sets = Math.min(maxLoggedSets, (last?.sets.length || 1) + (extraSets[key] ?? 0));
        const cardio = m.cardio;
        const unit = m.unit;
        return <fieldset className="tr-fieldset" key={key}><legend>{m.name}</legend>
          <input type="hidden" name={"exercise-" + m.position} value={m.id}/>
          <ExerciseAuthor name={m.author_name}/>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <label className="min-w-0 flex-1">Swap for<select value={m.id} disabled={editing}
              onChange={e => change("swap", m.position, e.target.value)}>
              <option value={m.id}>{m.name}</option><ExerciseOptions exercises={available}/>
            </select></label>
            <button type="button" className="tr-text-link mb-2" disabled={editing} aria-label={"Remove " + m.name}
              onClick={() => change("remove", m.position)}>Remove</button>
          </div>
          <div className="tr-set-head" aria-hidden="true"><span>Set</span><span>{cardio ? `Time (${unit})` : unitLabels[unit]}</span><span>{cardio ? "Power (watts)" : "Weight (lb)"}</span></div>
          {Array.from({ length: sets }, (_, index) => {
            const field = m.position + "-" + (index + 1);
            const prior = last?.sets[index];
            const load = prior && (cardio && "watts" in prior ? prior.watts : !cardio && "weight" in prior ? prior.weight : null);
            return <div className="tr-set" key={field}><span>{index + 1}</span>
              <input aria-label={m.name + " set " + (index + 1) + " " + unit} name={(cardio ? "time-" : "quantity-") + field} type="number"
                min={cardio ? 0 : 1} max={cardio ? undefined : 3600} step={cardio ? "any" : 1} defaultValue={last?.unit === unit ? prior?.quantity : undefined}/>
              <input aria-label={m.name + " set " + (index + 1) + (cardio ? " watts" : " weight in pounds")} name={(cardio ? "watts-" : "weight-") + field} type="number"
                min={0} max={cardio ? undefined : 5000} step="any" defaultValue={load ?? undefined}/>
            </div>;
          })}
          {sets < maxLoggedSets &&
            <button className="tr-text-link" type="button" aria-label={"Add a set to " + m.name}
              onClick={() => setExtraSets(current => ({ ...current, [key]: (current[key] ?? 0) + 1 }))}>+ Add set</button>}
        </fieldset>;
      })}
      {available.length > 0 && <label>Add exercise<select value="" disabled={editing}
        onChange={e => change("add", (movements.at(-1)?.position ?? 0) + 1, e.target.value)}>
        <option value="" disabled>Choose exercise</option><ExerciseOptions exercises={available}/>
      </select></label>}
      <label>Session notes (optional)<textarea name="notes" defaultValue={saved?.notes} rows={3} maxLength={1000}/></label>
      <FormMessage error={actionData?.error}/><SaveButton>{saved ? "Update log" : "Save session"}</SaveButton>
    </Form></div>;
}
