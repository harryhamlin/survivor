import { Link } from "react-router";
import type { Route } from "./+types/training-history";
import { listPlanDays, listSessions, lockWindow, requireTrainingUser } from "../training/data.server";
import { addDays, dayOfWeek, formatDate, trainingPath, weekdays, weekStart } from "../training/model";
import { ExerciseAuthor, PageTitle, useLocalToday } from "../training/ui";

export const meta = () => [{ title: "Training log | Torchsnuffers Training" }];
export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireTrainingUser(request);
  const { today, from, to } = lockWindow();
  const [sessions, lockedDays] = await Promise.all([listSessions(user), listPlanDays(user, from, to, true)]);
  return { sessions, lockedDays, today };
}
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function ThisWeek({ lockedDays, sessions, today }: Route.ComponentProps["loaderData"]) {
  const localToday = useLocalToday(today);
  const start = weekStart(localToday);
  const week = lockedDays.filter(d => d.date >= start && d.date <= addDays(start, 6));
  if (!week.length) return <div className="tr-empty mb-8"><h2>No week locked in</h2>
    <p>Build your <Link className="tr-text-link" to={trainingPath + "/weekly-plan"}>weekly plan</Link> and lock in this week to log its workouts here.</p></div>;
  return <section className="mb-8"><h2 className="mb-2 text-lg font-semibold">Week of {formatDate(start)}</h2>
    <ul className="tr-list">{week.map(d => {
      const logged = sessions.some(s => s.planned_on === d.date);
      const label = weekdays[dayOfWeek(d.date) - 1];
      return <li key={d.date} className={"tr-plan" + (d.date === localToday ? " bg-primary/10" : "")}>
        <div><h3>{label} <span className="tr-muted font-normal">· {formatDate(d.date)}{d.date === localToday && " · Today"}</span></h3>
          <p className="tr-muted">{d.exercises.length ? d.kind + " · " + d.exercises.map(e => e.name).join(", ") : d.kind === "Rest" ? "Rest day" : d.kind + " · No exercises"}</p>
        </div>
        <Link className={d.exercises.length || d.date === localToday ? "tr-button self-center" : "tr-text-link self-center"}
          to={trainingPath + "/log/" + d.date} aria-label={logged ? "Update log for " + label : "Log " + label + " workout"}>{logged ? "Update log" : "Log"}</Link>
      </li>;
    })}</ul></section>;
}

export default function History({ loaderData }: Route.ComponentProps) {
  const { sessions } = loaderData;
  return <><PageTitle title="Training log"/>
    <ThisWeek {...loaderData}/>
    <h2 className="mb-2 text-lg font-semibold">History</h2>
    {sessions.length ? <div className="tr-list">{sessions.map(s => <details key={s.id} className="tr-item">
      <summary><strong>{s.name}</strong><time dateTime={s.date}>{dateFormat.format(new Date(s.date))}</time>
        <span>{s.movements.reduce((n, m) => n + m.sets.length, 0)} sets</span></summary>
      <div className="tr-item-body">{s.movements.map((m, i) => <div className="tr-history-move" key={i}><h3>{m.name}</h3>
        <ExerciseAuthor name={m.author_name}/>
        <ol>{m.sets.map((set, j) => <li key={j}>Set {j + 1} · {set.quantity} {m.unit}
          {"watts" in set ? set.watts !== null && " · " + set.watts + " W" : set.weight !== null && " · " + set.weight + " lb"}</li>)}</ol>
      </div>)}{s.notes && <p className="tr-notes">{s.notes}</p>}
        {s.planned_on && <Link className="tr-text-link" to={trainingPath + "/log/" + s.planned_on}>Update log</Link>}
      </div>
    </details>)}</div> : <div className="tr-empty"><h2>Your log is empty</h2><p>Pick a day from your locked-in week and log your first set. Your completed sessions will appear here.</p></div>}
  </>;
}
