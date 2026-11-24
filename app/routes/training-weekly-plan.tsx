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
  const [restDays, setRestDays] = useState<number[]>([]);
  const rest = 7 - strength - endurance;
  const chosen = weekdays.filter((_, i) => restDays.includes(i + 1));
  const restError = rest < 0 ? "Strength and endurance days can't add up to more than 7."
    : chosen.length > rest ? `You picked ${chosen.length} rest days, but only ${rest} ${rest === 1 ? "day is" : "days are"} left after strength and endurance.`
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
    <fieldset className="tr-fieldset">
      <legend>Rest days (optional)</legend>
      <p className="tr-muted">Pick the weekdays you want off. Any other rest days are placed to space out your training.</p>
      <div className="tr-choices">{weekdays.map((day, i) => <label key={day}>
        <input type="checkbox" name="rest_day" value={i + 1} checked={restDays.includes(i + 1)}
          onChange={e => setRestDays(current => e.target.checked ? [...current, i + 1] : current.filter(d => d !== i + 1))}/>{day}
      </label>)}</div>
    </fieldset>
    <p className={restError ? "tr-error" : "tr-muted"} aria-live="polite">
      {restError ?? `Rest days: ${rest}` + (chosen.length ? ` · ${chosen.join(", ")}` + (rest > chosen.length ? ` + ${rest - chosen.length} placed for you` : "") : "")}
    </p>
    <fieldset className="tr-fieldset">
      <legend>Assign exercises to weekdays (optional)</legend>
      <p className="tr-muted">Open a day to choose exercises for this plan. You can choose several from the same category. Assignments stay on these dates if you generate this week again.</p>
      {weekdays.map((day, i) => {
        const assigned = new Set(days.find(d => d.date === addDays(week, i))?.exercises.filter(e => e.assigned).map(e => e.id));
        return <details key={day}>
          <summary className="cursor-pointer py-1 font-medium">{day} · {formatDate(addDays(week, i))}</summary>
          <div className="tr-choices tr-exercise-picks py-2">{exercises.map(exercise => <label key={exercise.id}>
            <input key={String(assigned.has(exercise.id))} type="checkbox" name={`assigned_${i + 1}`} value={exercise.id}
              defaultChecked={assigned.has(exercise.id)} disabled={assigned.has(exercise.id)}/>
            {exercise.name}{assigned.has(exercise.id) && " (assigned)"}
          </label>)}</div>
        </details>;
      })}
    </fieldset>
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
    <button className="tr-button" type="submit" disabled={busy || restError !== null}>Generate week</button>
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
  const locked = days.some(d => d.locked);
  return <>
    <PageTitle title="Weekly plan"/>
    <p className="tr-intro">{formatDate(week)}–{formatDate(end)}</p>
    <FormMessage error={actionData?.error}/>
    {exercises.length ? <>
      <Form method="post" className="tr-form mb-8">
        <h2>Add an exercise to this week</h2>
        <input type="hidden" name="week" value={week}/>
        <input type="hidden" name="intent" value="add"/>
        <div className="tr-pair">
          <label>Day<select name="day">{weekdays.map((day, index) =>
            <option key={day} value={index + 1}>{day} · {formatDate(addDays(week, index))}</option>)}</select></label>
          <label>Exercise<select name="exercise" required defaultValue="">
            <option value="" disabled>Choose exercise</option>
            {exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select></label>
        </div>
        <button className="tr-secondary" type="submit" disabled={busy}>Add exercise</button>
      </Form>
      <Generator key={week} exercises={exercises} days={days} week={week} busy={busy}/>
    </> : <p className="mb-6"><Link className="tr-text-link" to={trainingPath + "/exercises/new?next=weekly-plan"}>Add your first exercise</Link></p>}
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
        ))}</ul> : <p className="tr-muted">{plan?.kind === "Rest" ? "Rest day" : "No exercises planned"}</p>}
      </section>;
    })}</div>
    {locked ? <Link className="tr-button mt-8" to={trainingPath + "/log"}>Open this week in the training log</Link>
      : <Form method="post" className="tr-form mt-8">
        <input type="hidden" name="intent" value="lock"/>
        <input type="hidden" name="week" value={week}/>
        <button className="tr-button" disabled={busy || !days.some(d => d.exercises.length)}>Lock in this week</button>
      </Form>}
  </>;
}
