import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/training-weekly-plan";
import { readFormData } from "../security.server";
import { editCurrentPlan, listExercises, listPlanDays, lockWindow, requireTrainingUser } from "../training/data.server";
import { fullBodySlots, type ExerciseSource } from "../training/generator";
import { addDays, formatDate, movementFocuses, restChoice, trainingPath, weekdays, weekStart, type Exercise } from "../training/model";
import { ExerciseOptions, FormMessage, PageTitle, useLocalToday } from "../training/ui";

export const meta = () => [{ title: "Weekly plan | Torchsnuffers Training" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireTrainingUser(request);
  const { today, from, to } = lockWindow();
  const [exercises, days] = await Promise.all([listExercises(user), listPlanDays(user, from, to)]);
  return { exercises, days, today };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireTrainingUser(request);
  const form = await readFormData(request);
  const intent = form.get("intent");
  const error = await editCurrentPlan(user, form);
  if (error) return data({ error }, { status: 400 });
  return redirect(trainingPath + (intent === "lock" ? "/log" : "/weekly-plan"));
}

const sources: [ExerciseSource, string][] = [
  ["random", "Random from my library"],
  ["picks", "Only exercises I choose"],
  ["mix", "My choices, filled in randomly"],
];
const dayCounts = Array.from({ length: 8 }, (_, n) => n);

function Generator({ exercises, days, week, busy }: {
  exercises: Exercise[]; days: Route.ComponentProps["loaderData"]["days"]; week: string; busy: boolean;
}) {
  const [strength, setStrength] = useState(() => days.length ? days.filter(d => d.kind === "Strength").length : 3);
  const [endurance, setEndurance] = useState(() => days.length ? days.filter(d => d.kind === "Endurance").length : 2);
  const [source, setSource] = useState<ExerciseSource>("random");
  const trainingDays = strength + endurance;
  const assignedRest = days.filter(d => d.rest_assigned).length;
  const countError = trainingDays > 7 ? "Strength and endurance days can't add up to more than 7."
    : trainingDays + assignedRest > 7 ? `You assigned Rest to ${assignedRest} of the 7 days. Lower the training day counts or remove a Rest assignment.`
    : null;
  return <Form method="post" className="tr-form mb-8 border border-primary/40 p-4">
    <h2>Generate this week</h2>
    <input type="hidden" name="week" value={week}/>
    <p className="tr-muted">Random fill chooses one exercise for each missing strength category in order ({fullBodySlots.map(s => s.label.toLowerCase()).join(" → ")}). Endurance days get cardio.</p>
    <input type="hidden" name="intent" value="generate"/>
    <div className="tr-pair">
      <label>Strength days<select name="strength_days" value={strength} onChange={e => setStrength(Number(e.target.value))}>
        {dayCounts.map(n => <option key={n}>{n}</option>)}</select></label>
      <label>Endurance days<select name="endurance_days" value={endurance} onChange={e => setEndurance(Number(e.target.value))}>
        {dayCounts.map(n => <option key={n}>{n}</option>)}</select></label>
    </div>
    <p className={countError ? "tr-error" : "tr-muted"} aria-live="polite">
      {countError ?? `Rest days: ${7 - trainingDays}`}
    </p>
    <fieldset className="tr-fieldset">
      <legend>Exercises for open slots</legend>
      <div className="tr-choices tr-stack">{sources.map(([value, label]) => <label key={value}>
        <input type="radio" name="source" value={value} checked={source === value} onChange={() => setSource(value)}/>{label}
      </label>)}</div>
    </fieldset>
    {source !== "random" && <fieldset className="tr-fieldset">
      <legend>Exercises to include</legend>
      <p className="tr-muted">The planner spreads your strength picks across strength days and your cardio picks across endurance days.</p>
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
    <button className="tr-button" type="submit" disabled={busy || countError !== null}>Generate week</button>
  </Form>;
}

// Trades a whole weekday with another. The picker stays hidden until you ask to swap.
function DaySwap({ day, week, busy }: { day: number; week: string; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const name = weekdays[day - 1];
  if (!open) return <button type="button" className="tr-text-link" onClick={() => setOpen(true)}
    aria-label={"Swap " + name + " with another day"}>Swap</button>;
  return <Form method="post" className="flex items-center gap-2 text-sm" onSubmit={() => setOpen(false)}>
    <input type="hidden" name="intent" value="swap-days"/>
    <input type="hidden" name="week" value={week}/>
    <input type="hidden" name="day" value={day}/>
    <select name="with" aria-label={"Swap " + name + " with"} required defaultValue="" autoFocus
      className="border border-primary/40 bg-background px-2 py-1 text-primary">
      <option value="" disabled>Swap with…</option>
      {weekdays.map((other, i) => i + 1 !== day && <option key={other} value={i + 1}>{other}</option>)}
    </select>
    <button type="submit" className="tr-text-link" disabled={busy}>Swap</button>
    <button type="button" className="tr-text-link" onClick={() => setOpen(false)}>Cancel</button>
  </Form>;
}

// One planned exercise. Switch opens a picker to replace it in place, or to make the whole day a rest day.
function PlanEntry({ entry, day, week, busy, options }: {
  entry: { id: string; name: string };
  day: number; week: string; busy: boolean; options: Exercise[];
}) {
  const [switching, setSwitching] = useState(false);
  const name = weekdays[day - 1];
  return <li>
    <div className="flex justify-between gap-4">
      <p className="min-w-0 break-words">{entry.name}</p>
      <Form method="post" className="flex flex-wrap items-start justify-end gap-x-3">
        <input type="hidden" name="week" value={week}/>
        <input type="hidden" name="day" value={day}/>
        <input type="hidden" name="exercise" value={entry.id}/>
        {!switching && <button type="button" className="tr-text-link" onClick={() => setSwitching(true)}
          aria-label={"Switch " + entry.name + " on " + name}>Switch</button>}
        <button type="submit" name="intent" value="remove" className="tr-text-link" disabled={busy}
          aria-label={"Remove " + entry.name + " from " + name}>Remove</button>
      </Form>
    </div>
    {switching && <Form method="post" preventScrollReset className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" onSubmit={() => setSwitching(false)}>
      <input type="hidden" name="intent" value="switch"/>
      <input type="hidden" name="week" value={week}/>
      <input type="hidden" name="day" value={day}/>
      <input type="hidden" name="exercise" value={entry.id}/>
      <select name="replacement" aria-label={"Replace " + entry.name + " on " + name + " with"} required defaultValue="" autoFocus
        className="min-w-0 flex-1 border border-primary/40 bg-background px-2 py-1 text-primary">
        <option value="" disabled>Switch to…</option>
        <option value={restChoice}>Make {name} a rest day</option>
        <ExerciseOptions exercises={options.filter(e => e.id !== entry.id)}/>
      </select>
      <button type="submit" className="tr-text-link" disabled={busy}>Switch</button>
      <button type="button" className="tr-text-link" onClick={() => setSwitching(false)}>Cancel</button>
    </Form>}
  </li>;
}

export default function WeeklyPlan({ loaderData: { exercises, days: loaded, today }, actionData }: Route.ComponentProps) {
  const busy = useNavigation().state !== "idle";
  const week = weekStart(useLocalToday(today));
  const end = addDays(week, 6);
  const days = loaded.filter(d => d.date >= week && d.date <= end);
  const [selectedExercise, setSelectedExercise] = useState("");
  const choosingRest = selectedExercise === restChoice;
  const locked = days.some(d => d.locked);
  return <>
    <PageTitle title="Weekly plan"/>
    <p className="tr-intro">{formatDate(week)}–{formatDate(end)}</p>
    <FormMessage error={actionData?.error}/>
    <Form method="post" className="tr-form mb-8">
      <h2>Add an exercise to a day this week</h2>
      <input type="hidden" name="week" value={week}/>
      <input type="hidden" name="intent" value="add"/>
      <div className="tr-pair">
        <label>Day<select name="day">{weekdays.map((day, index) =>
          <option key={day} value={index + 1}>{day} · {formatDate(addDays(week, index))}</option>)}</select></label>
        <label>Exercise<select name="exercise" required value={selectedExercise} onChange={e => setSelectedExercise(e.target.value)}>
          <option value="" disabled>Choose exercise</option>
          <option value={restChoice}>Rest</option>
          {exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select></label>
      </div>
      {choosingRest && <p className="tr-muted">Rest replaces the exercises planned for this date.</p>}
      <button className="tr-secondary" type="submit" disabled={busy}>{choosingRest ? "Set rest day" : "Add exercise"}</button>
    </Form>
    {exercises.length ? <Generator key={week} exercises={exercises} days={days} week={week} busy={busy}/>
      : <p className="mb-6"><Link className="tr-text-link" to={trainingPath + "/exercises/new?next=weekly-plan"}>Add your first exercise</Link></p>}
    <div className="tr-list">{weekdays.map((day, index) => {
      const dayNumber = index + 1;
      const date = addDays(week, index);
      const plan = days.find(d => d.date === date);
      const planned = plan?.exercises ?? [];
      return <section key={day} className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{day} · {formatDate(date)}{plan && <span className="tr-muted font-normal"> · {plan.kind}</span>}</h2>
          <DaySwap week={week} day={dayNumber} busy={busy}/>
        </div>
        {planned.length ? <ul className="mt-2 space-y-2">{planned.map(entry => (
          <PlanEntry week={week} key={entry.id} entry={entry} day={dayNumber} busy={busy}
            options={exercises.filter(e => e.id === entry.id || !planned.some(p => p.id === e.id))}/>
        ))}</ul> : plan?.rest_assigned ? <Form method="post" preventScrollReset className="mt-2 flex items-center justify-between">
          <span>Rest</span>
          <input type="hidden" name="week" value={week}/>
          <input type="hidden" name="day" value={dayNumber}/>
          <input type="hidden" name="intent" value="remove"/>
          <input type="hidden" name="exercise" value={restChoice}/>
          <button className="tr-text-link" disabled={busy} aria-label={"Remove Rest from " + day}>Remove</button>
        </Form> : <p className="tr-muted">{plan?.kind === "Rest" ? "Rest day" : "No exercises planned"}</p>}
      </section>;
    })}</div>
    {locked ? <Link className="tr-button mt-8" to={trainingPath + "/log"}>Open this week in the training log</Link>
      : <Form method="post" className="tr-form mt-8">
        <input type="hidden" name="intent" value="lock"/>
        <input type="hidden" name="week" value={week}/>
        <button className="tr-button" disabled={busy || !days.some(d => d.rest_assigned || d.exercises.length)}>Lock in this week</button>
      </Form>}
  </>;
}
