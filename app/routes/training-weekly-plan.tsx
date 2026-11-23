import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/training-weekly-plan";
import { readFormData } from "../security.server";
import {
  generateWeeklyPlan, listExercises, listWeeklyDays, listWeeklyPlan, requireTrainingUser, updateWeeklyPlan,
} from "../training/data.server";
import { fullBodySlots, type DayKind, type ExerciseSource } from "../training/generator";
import { movementFocuses, trainingPath, weekdays, type Exercise } from "../training/model";
import { ExerciseAuthor, FormMessage, PageTitle } from "../training/ui";

export const meta = () => [{ title: "Weekly plan | Torchsnuffers Training" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireTrainingUser(request);
  const [exercises, entries, days] = await Promise.all([listExercises(user), listWeeklyPlan(user), listWeeklyDays(user)]);
  return { exercises, entries, days };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireTrainingUser(request);
  const form = await readFormData(request);
  const error = form.get("intent") === "generate" ? await generateWeeklyPlan(user, form) : await updateWeeklyPlan(user, form);
  if (error) return data({ error }, { status: 400 });
  return redirect(trainingPath + "/weekly-plan");
}

const sources: [ExerciseSource, string][] = [
  ["random", "Random from my library"],
  ["picks", "Only exercises I choose"],
  ["mix", "My choices, filled in randomly"],
];
const dayCounts = Array.from({ length: 8 }, (_, n) => n);

function Generator({ exercises, days, busy }: { exercises: Exercise[]; days: { kind: DayKind }[]; busy: boolean }) {
  const [strength, setStrength] = useState(() => days.length ? days.filter(d => d.kind === "Strength").length : 3);
  const [endurance, setEndurance] = useState(() => days.length ? days.filter(d => d.kind === "Endurance").length : 2);
  const [source, setSource] = useState<ExerciseSource>("random");
  const rest = 7 - strength - endurance;
  return <Form method="post" className="tr-form mb-8 border border-primary/40 p-4">
    <h2>Generate a week</h2>
    <p className="tr-muted">Each strength day is one full-body workout: {fullBodySlots.map(s => s.label.toLowerCase()).join(" → ")}. Endurance days get a cardio exercise.</p>
    <input type="hidden" name="intent" value="generate"/>
    <div className="tr-pair">
      <label>Strength days<select name="strength_days" value={strength} onChange={e => setStrength(Number(e.target.value))}>
        {dayCounts.map(n => <option key={n}>{n}</option>)}</select></label>
      <label>Endurance days<select name="endurance_days" value={endurance} onChange={e => setEndurance(Number(e.target.value))}>
        {dayCounts.map(n => <option key={n}>{n}</option>)}</select></label>
    </div>
    <p className={rest < 0 ? "tr-error" : "tr-muted"} aria-live="polite">
      {rest < 0 ? "Strength and endurance days can't add up to more than 7." : `Rest days: ${rest}`}
    </p>
    <fieldset className="tr-fieldset">
      <legend>Exercises for open slots</legend>
      <div className="tr-choices tr-stack">{sources.map(([value, label]) => <label key={value}>
        <input type="radio" name="source" value={value} checked={source === value} onChange={() => setSource(value)}/>{label}
      </label>)}</div>
    </fieldset>
    {source !== "random" && <fieldset className="tr-fieldset">
      <legend>Exercises to include</legend>
      <p className="tr-muted">Each pick fills its matching slot on one strength day; cardio picks go on endurance days.</p>
      {movementFocuses.map(focus => {
        const options = exercises.filter(e => e.focus === focus);
        return options.length ? <div key={focus}>
          <h3 className="mb-1 mt-3 font-semibold">{focus}</h3>
          <div className="tr-choices tr-exercise-picks">{options.map(e => <label key={e.id}>
            <input type="checkbox" name="pick" value={e.id}/>{e.name}
          </label>)}</div>
        </div> : null;
      })}
    </fieldset>}
    <button className="tr-button" type="submit" disabled={busy || rest < 0}>Generate week</button>
    <p className="tr-muted">Pinned exercises stay on their weekdays each time you generate.</p>
  </Form>;
}

export default function WeeklyPlan({ loaderData: { exercises, entries, days }, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const pins = entries.filter(entry => entry.pinned);
  return <>
    <PageTitle title="Weekly plan"/>
    <p className="tr-intro">Your schedule repeats each week.</p>
    <FormMessage error={actionData?.error}/>
    {exercises.length ? <>
      <Form method="post" className="tr-form mb-8">
        <h2>Pin exercises to weekdays</h2>
        <p className="tr-muted">Pin a lift to make that day a strength day, or pin cardio for an endurance day.</p>
        <input type="hidden" name="intent" value="add"/>
        <div className="tr-pair">
          <label>Day<select name="day">{weekdays.map((day, index) =>
            <option key={day} value={index + 1}>{day}</option>)}</select></label>
          <label>Exercise<select name="exercise" required defaultValue="">
            <option value="" disabled>Choose exercise</option>
            {exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select></label>
        </div>
        <button className="tr-secondary" type="submit" disabled={busy}>Pin exercise</button>
        {pins.length > 0 && <ul aria-label="Pinned exercises" className="space-y-1 text-sm wrap-anywhere">
          {pins.map(pin => <li key={pin.day_of_week + "-" + pin.exercise_id}>
            {weekdays[pin.day_of_week - 1]} · {pin.name}
          </li>)}
        </ul>}
      </Form>
      <Generator exercises={exercises} days={days} busy={busy}/>
    </> : <p className="mb-6"><Link className="tr-text-link" to={trainingPath + "/exercises/new?next=weekly-plan"}>Add your first exercise</Link></p>}
    <div className="tr-list">{weekdays.map((day, index) => {
      const dayNumber = index + 1;
      const kind = days.find(d => d.day_of_week === dayNumber)?.kind;
      const planned = entries.filter(entry => entry.day_of_week === dayNumber);
      const pending = kind && planned.some(e => e.pinned && kind !== (e.focus === "Cardio" ? "Endurance" : "Strength"));
      return <section key={day} className="p-4">
        <h2 className="font-semibold">{day}{kind && <span className="tr-muted font-normal"> · {pending ? "Generate to update day" : kind}</span>}</h2>
        {planned.length ? <ul className="mt-2 space-y-2">{planned.map(entry => (
          <li key={entry.exercise_id} className="flex justify-between gap-4">
            <div className="min-w-0 break-words"><p>{entry.name}{entry.pinned && <span className="tr-muted"> · Pinned</span>}</p><ExerciseAuthor name={entry.author_name}/></div>
            <Form method="post" className="flex flex-wrap items-start justify-end gap-x-3">
              <input type="hidden" name="day" value={dayNumber}/>
              <input type="hidden" name="exercise" value={entry.exercise_id}/>
              {!entry.pinned && <button type="submit" name="intent" value="add" className="tr-text-link" disabled={busy}
                aria-label={"Pin " + entry.name + " to " + day}>Pin</button>}
              <button type="submit" name="intent" value="remove" className="tr-text-link" disabled={busy}
                aria-label={"Remove " + entry.name + " from " + day}>Remove</button>
            </Form>
          </li>
        ))}</ul> : <p className="tr-muted">{kind === "Rest" ? "Rest day" : "No exercises planned"}</p>}
      </section>;
    })}</div>
  </>;
}
