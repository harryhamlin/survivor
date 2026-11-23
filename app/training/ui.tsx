import type { ReactNode } from "react";
import { Link, useNavigation } from "react-router";
import { movementFocuses, muscleGroups, trainingGoals, trainingPath, type TrainingFocus } from "./model";

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="tr-title"><h1>{title}</h1>{children}</div>;
}

export function BackLink({ to = trainingPath, children = "Workout library" }: { to?: string; children?: ReactNode }) {
  return <Link className="tr-back" to={to}>{children}</Link>;
}

function CheckboxGroup({ label, name, options, hint, selected, onToggle }: {
  label: string;
  name: string;
  options: readonly string[];
  hint: string;
  selected?: readonly string[];
  onToggle?: (option: string, checked: boolean) => void;
}) {
  return <fieldset className="tr-fieldset">
    <legend>{label}</legend>
    <p className="tr-muted">{hint}</p>
    <div className="tr-choices">{options.map(option => (
      <label key={option}>
        <input type="checkbox" name={name} value={option} checked={selected?.includes(option)}
          onChange={onToggle && (event => onToggle(option, event.target.checked))}/>
        {option}
      </label>
    ))}</div>
  </fieldset>;
}

export function FocusFields() {
  return <>
    <label>Movement focus<select name="focus" required defaultValue="">
      <option disabled value="">Choose focus</option>
      {movementFocuses.map(option => <option key={option}>{option}</option>)}
    </select></label>
    <CheckboxGroup label="Training goals" name="goals" options={trainingGoals} hint="Choose one or more."/>
    <CheckboxGroup label="Muscle groups" name="muscle_groups" options={muscleGroups} hint="Choose one or more."/>
  </>;
}

export function FocusSummary({ focus, goals, muscle_groups }: TrainingFocus) {
  return <span className="tr-muted">{focus} · {muscle_groups.join(", ")} · {goals.join(", ")}</span>;
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

type Filters = { query: string; focus: string; muscle: string; goals: string[] };
export const emptyFilters: Filters = { query: "", focus: "", muscle: "", goals: [] };

export function matchesFilters(item: TrainingFocus & { name: string }, filters: Filters, ...extra: string[]) {
  const text = [item.name, item.focus, ...item.muscle_groups, ...item.goals, ...extra].join(" ").toLowerCase();
  return (!filters.focus || item.focus === filters.focus) &&
    (!filters.muscle || item.muscle_groups.some(group => group === filters.muscle)) &&
    (!filters.goals.length || item.goals.some(goal => filters.goals.includes(goal))) && text.includes(filters.query.trim().toLowerCase());
}

export function LibraryTools({ filters, onChange, noun }: {
  filters: Filters; onChange: (filters: Filters) => void; noun: string;
}) {
  return <div className="tr-tools">
    <input aria-label={"Search " + noun} type="search" placeholder={"Search " + noun} value={filters.query}
      onChange={e => onChange({ ...filters, query: e.target.value })}/>
    <div className="grid gap-2 sm:grid-cols-2">
      {([
        ["focus", "Movement focus", movementFocuses],
        ["muscle", "Muscle group", muscleGroups],
      ] as const).map(([key, label, options]) =>
        <label key={key}>{label}<select value={filters[key]} onChange={e => onChange({ ...filters, [key]: e.target.value })}>
          <option value="">All</option>{options.map(option => <option key={option}>{option}</option>)}
        </select></label>
      )}
    </div>
    <CheckboxGroup label="Training goals" name="filter_goals" options={trainingGoals} hint="Match any selected goal."
      selected={filters.goals}
      onToggle={(goal, checked) => onChange({
        ...filters, goals: checked ? [...filters.goals, goal] : filters.goals.filter(value => value !== goal),
      })}/>
  </div>;
}

export function WorkoutMeta({ minutes, count }: { minutes: number; count: number }) {
  return <span className="tr-muted tabular-nums">{minutes} min · {count} {count === 1 ? "exercise" : "exercises"}</span>;
}
