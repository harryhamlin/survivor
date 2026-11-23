import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigation } from "react-router";
import { localToday, movementFocuses, muscleGroups, trainingGoals, trainingPath, type Exercise, type TrainingFocus } from "./model";

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="tr-title"><h1>{title}</h1>{children}</div>;
}

export function BackLink({ to = trainingPath + "/log", children = "Training log" }: { to?: string; children?: ReactNode }) {
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

// <option>s for a <select>, grouped by movement focus.
export function ExerciseOptions({ exercises }: { exercises: Pick<Exercise, "id" | "name" | "focus">[] }) {
  return movementFocuses.map(focus => {
    const options = exercises.filter(e => e.focus === focus);
    return options.length ? <optgroup key={focus} label={focus}>
      {options.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </optgroup> : null;
  });
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

// The server renders with its own date; the browser's calendar day takes over after hydration.
export function useLocalToday(serverToday: string) {
  const [today, setToday] = useState(serverToday);
  useEffect(() => setToday(localToday()), []);
  return today;
}
