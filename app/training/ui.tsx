import type { ReactNode } from "react";
import { Link, useNavigation } from "react-router";
import { focusAreas, trainingPath } from "./model";

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="tr-title"><h1>{title}</h1>{children}</div>;
}

export function BackLink({ to = trainingPath, children = "Workout library" }: { to?: string; children?: ReactNode }) {
  return <Link className="tr-back" to={to}>{children}</Link>;
}

export function FocusField() {
  return <label>Focus<select name="focus">{focusAreas.map(focus => <option key={focus}>{focus}</option>)}</select></label>;
}

export function FormMessage({ error }: { error?: string }) {
  return error ? <p role="alert" className="tr-error">{error}</p> : null;
}

export function SaveButton({ children }: { children: ReactNode }) {
  const busy = useNavigation().state !== "idle";
  return <button className="tr-button" disabled={busy} type="submit">{busy ? "Saving…" : children}</button>;
}

export function LibraryTools({ personal, setPersonal, query, setQuery, signedIn, noun }: {
  personal: boolean; setPersonal: (value: boolean) => void;
  query: string; setQuery: (value: string) => void;
  signedIn: boolean; noun: string;
}) {
  return <div className="tr-tools">
    <input aria-label={"Search " + noun} type="search" placeholder={"Search " + noun} value={query} onChange={e => setQuery(e.target.value)} />
    {signedIn && (
      <div className="tr-tabs" role="group" aria-label={noun + " collection"}>
        <button type="button" aria-pressed={!personal} onClick={() => setPersonal(false)}>All {noun}</button>
        <button type="button" aria-pressed={personal} onClick={() => setPersonal(true)}>My {noun}</button>
      </div>
    )}
  </div>;
}

export function WorkoutMeta({ minutes, count }: { minutes: number; count: number }) {
  return <span className="tr-muted tabular-nums">{minutes} min · {count} {count === 1 ? "exercise" : "exercises"}</span>;
}
