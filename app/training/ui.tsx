import type { ReactNode } from "react";
import { Link, useNavigation } from "react-router";
import { movementFocuses, muscleGroups, trainingGoals, trainingPath, type TrainingFocus } from "./model";

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="tr-title"><h1>{title}</h1>{children}</div>;
}

export function BackLink({ to = trainingPath, children = "Workout library" }: { to?: string; children?: ReactNode }) {
  return <Link className="tr-back" to={to}>{children}</Link>;
}

export function FocusFields() {
  return <>
    <div className="tr-pair">
      <label>Movement focus<select name="focus" required defaultValue="">
        <option disabled value="">Choose focus</option>
        {movementFocuses.map(option => <option key={option}>{option}</option>)}
      </select></label>
      <label>Training goal<select name="goal" required defaultValue="">
        <option disabled value="">Choose goal</option>
        {trainingGoals.map(option => <option key={option}>{option}</option>)}
      </select></label>
    </div>
    <fieldset className="tr-fieldset"><legend>Muscle groups</legend>
      <p className="tr-muted">Choose one or more.</p>
      <div className="tr-muscles">{muscleGroups.map(group =>
        <label key={group}><input type="checkbox" name="muscle_groups" value={group}/> {group}</label>
      )}</div>
    </fieldset>
  </>;
}

export function FocusSummary({ focus, goal, muscle_groups }: TrainingFocus) {
  return <span className="tr-muted">{focus} · {muscle_groups.join(", ")} · {goal}</span>;
}

export function ExerciseAuthor({ name }: { name: string }) {
  return <span className="tr-muted">Created by {name}</span>;
}

export function FormMessage({ error }: { error?: string }) {
  return error ? <p role="alert" className="tr-error">{error}</p> : null;
}

export function SaveButton({ children }: { children: ReactNode }) {
  const busy = useNavigation().state !== "idle";
  return <button className="tr-button" disabled={busy} type="submit">{busy ? "Saving…" : children}</button>;
}

export const emptyFilters = { query: "", focus: "", muscle: "", goal: "" };
type Filters = typeof emptyFilters;

export function matchesFilters(item: TrainingFocus & { name: string }, filters: Filters, ...extra: string[]) {
  const text = [item.name, item.focus, ...item.muscle_groups, item.goal, ...extra].join(" ").toLowerCase();
  return (!filters.focus || item.focus === filters.focus) &&
    (!filters.muscle || item.muscle_groups.some(group => group === filters.muscle)) &&
    (!filters.goal || item.goal === filters.goal) && text.includes(filters.query.trim().toLowerCase());
}

export function LibraryTools({ filters, onChange, noun }: {
  filters: Filters; onChange: (filters: Filters) => void; noun: string;
}) {
  return <div className="tr-tools">
    <input aria-label={"Search " + noun} type="search" placeholder={"Search " + noun} value={filters.query}
      onChange={e => onChange({ ...filters, query: e.target.value })}/>
    <div className="grid gap-2 sm:grid-cols-3">
      {([
        ["focus", "Movement focus", movementFocuses],
        ["muscle", "Muscle group", muscleGroups],
        ["goal", "Training goal", trainingGoals],
      ] as const).map(([key, label, options]) =>
        <label key={key}>{label}<select value={filters[key]} onChange={e => onChange({ ...filters, [key]: e.target.value })}>
          <option value="">All</option>{options.map(option => <option key={option}>{option}</option>)}
        </select></label>
      )}
    </div>
  </div>;
}

export function WorkoutMeta({ minutes, count }: { minutes: number; count: number }) {
  return <span className="tr-muted tabular-nums">{minutes} min · {count} {count === 1 ? "exercise" : "exercises"}</span>;
}
