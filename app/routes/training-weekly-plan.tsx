import { useState } from "react";
import { data, Form, Link, redirect, useNavigation } from "react-router";
import type { Route } from "./+types/training-weekly-plan";
import { readFormData } from "../security.server";
import {
  generateWeeklyPlan, listExercises, listLockedDays, listWeeklyDays, listWeeklyPlan, lockWeek, lockWindow,
  requireTrainingUser, swapWeeklyDays, switchWeeklyExercise, updateWeeklyPlan,
} from "../training/data.server";
import { fullBodySlots, type DayKind, type ExerciseSource } from "../training/generator";
import { addDays, formatDate, movementFocuses, restChoice, trainingPath, weekdays, weekStart, type Exercise } from "../training/model";
import { ExerciseAuthor, ExerciseOptions, FormMessage, PageTitle, useLocalToday } from "../training/ui";

export const meta = () => [{ title: "Weekly plan | Torchsnuffers Training" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireTrainingUser(request);
  const { today, from, to } = lockWindow();
  const [exercises, entries, days, locked] = await Promise.all([
    listExercises(user), listWeeklyPlan(user), listWeeklyDays(user), listLockedDays(user, from, to),
  ]);
  return { exercises, entries, days, lockedDates: locked.map(d => d.date), today };
}

export async function action({ request }: Route.ActionArgs) {
  const user = await requireTrainingUser(request);
  const form = await readFormData(request);
  const intent = form.get("intent");
  const error = intent === "generate" ? await generateWeeklyPlan(user, form)
    : intent === "lock" ? await lockWeek(user, form)
    : intent === "swap-days" ? await swapWeeklyDays(user, form)
    : intent === "switch" ? await switchWeeklyExercise(user, form) : await updateWeeklyPlan(user, form);
  if (error) return data({ error }, { status: 400 });
  return redirect(trainingPath + (intent === "lock" ? "/log" : "/weekly-plan"));
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
  const [restDays, setRestDays] = useState<number[]>([]);
  const rest = 7 - strength - endurance;
  const chosen = weekdays.filter((_, i) => restDays.includes(i + 1));
  const restError = rest < 0 ? "Strength and endurance days can't add up to more than 7."
    : chosen.length > rest ? `You picked ${chosen.length} rest days, but only ${rest} ${rest === 1 ? "day is" : "days are"} left after strength and endurance.`
    : null;
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
    <button className="tr-button" type="submit" disabled={busy || restError !== null}>Generate week</button>
    <p className="tr-muted">Pinned exercises stay on their weekdays each time you generate.</p>
  </Form>;
}

// Trades a whole weekday with another. The picker stays hidden until you ask to swap.
function DaySwap({ day, busy }: { day: number; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const name = weekdays[day - 1];
  if (!open) return <button type="button" className="tr-text-link" onClick={() => setOpen(true)}
    aria-label={"Swap " + name + " with another day"}>Swap</button>;
  return <Form method="post" className="flex items-center gap-2 text-sm" onSubmit={() => setOpen(false)}>
    <input type="hidden" name="intent" value="swap-days"/>
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
function PlanEntry({ entry, day, busy, options }: {
  entry: { exercise_id: string; name: string; author_name: string; pinned: boolean };
  day: number; busy: boolean; options: Exercise[];
}) {
  const [switching, setSwitching] = useState(false);
  const name = weekdays[day - 1];
  return <li>
    <div className="flex justify-between gap-4">
      <div className="min-w-0 break-words"><p>{entry.name}{entry.pinned && <span className="tr-muted"> · Pinned</span>}</p><ExerciseAuthor name={entry.author_name}/></div>
      <Form method="post" className="flex flex-wrap items-start justify-end gap-x-3">
        <input type="hidden" name="day" value={day}/>
        <input type="hidden" name="exercise" value={entry.exercise_id}/>
        {!switching && <button type="button" className="tr-text-link" onClick={() => setSwitching(true)}
          aria-label={"Switch " + entry.name + " on " + name}>Switch</button>}
        {!entry.pinned && <button type="submit" name="intent" value="add" className="tr-text-link" disabled={busy}
          aria-label={"Pin " + entry.name + " to " + name}>Pin</button>}
        <button type="submit" name="intent" value="remove" className="tr-text-link" disabled={busy}
          aria-label={"Remove " + entry.name + " from " + name}>Remove</button>
      </Form>
    </div>
    {switching && <Form method="post" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" onSubmit={() => setSwitching(false)}>
      <input type="hidden" name="intent" value="switch"/>
      <input type="hidden" name="day" value={day}/>
      <input type="hidden" name="exercise" value={entry.exercise_id}/>
      <select name="replacement" aria-label={"Replace " + entry.name + " on " + name + " with"} required defaultValue="" autoFocus
        className="min-w-0 flex-1 border border-primary/40 bg-background px-2 py-1 text-primary">
        <option value="" disabled>Switch to…</option>
        <option value={restChoice}>Make {name} a rest day</option>
        <ExerciseOptions exercises={options.filter(e => e.id !== entry.exercise_id)}/>
      </select>
      <button type="submit" className="tr-text-link" disabled={busy}>Switch</button>
      <button type="button" className="tr-text-link" onClick={() => setSwitching(false)}>Cancel</button>
    </Form>}
  </li>;
}

function LockWeek({ lockedDates, today: serverToday, busy, empty }: {
  lockedDates: string[]; today: string; busy: boolean; empty: boolean;
}) {
  const today = useLocalToday(serverToday);
  const start = weekStart(today);
  const locked = lockedDates.some(d => d >= start && d <= addDays(start, 6));
  const range = formatDate(start) + "–" + formatDate(addDays(start, 6));
  return <Form method="post" className="tr-form mt-8 border border-primary/40 p-4">
    <h2>{locked ? "This week is locked in" : "Lock in this week"}</h2>
    <input type="hidden" name="intent" value="lock"/>
    <input type="hidden" name="today" value={today}/>
    <p className="tr-muted">{locked
      ? `${range} is set in your training log. Locking in again replaces it with this plan, including any exercises you changed while logging.`
      : `Set ${range} to this plan so each day's workout is ready in your training log. You can still swap exercises while you log.`}</p>
    <button className="tr-button" type="submit" disabled={busy || empty}>{locked ? "Lock in this week again" : "Lock in this week"}</button>
  </Form>;
}

export default function WeeklyPlan({ loaderData: { exercises, entries, days, lockedDates, today }, actionData }: Route.ComponentProps) {
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{day}{kind && <span className="tr-muted font-normal"> · {pending ? "Generate to update day" : kind}</span>}</h2>
          <DaySwap day={dayNumber} busy={busy}/>
        </div>
        {planned.length ? <ul className="mt-2 space-y-2">{planned.map(entry => (
          <PlanEntry key={entry.exercise_id} entry={entry} day={dayNumber} busy={busy}
            options={exercises.filter(e => e.id === entry.exercise_id || !planned.some(p => p.exercise_id === e.id))}/>
        ))}</ul> : <p className="tr-muted">{kind === "Rest" ? "Rest day" : "No exercises planned"}</p>}
      </section>;
    })}</div>
    <LockWeek lockedDates={lockedDates} today={today} busy={busy} empty={!entries.length}/>
  </>;
}
