import { Link } from "react-router";
import type { Route } from "./+types/training-history";
import { listSessions, requireTrainingUser } from "../training/data.server";
import { trainingPath } from "../training/model";
import { PageTitle } from "../training/ui";

export const meta = () => [{ title: "Training log | Torchsnuffers Training" }];
export async function loader({ request }: Route.LoaderArgs) {
  return { sessions: await listSessions(await requireTrainingUser(request)) };
}
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export default function History({ loaderData: { sessions } }: Route.ComponentProps) {
  return <><PageTitle title="Training log"><Link className="tr-button" to={trainingPath}>Choose workout</Link></PageTitle>
    {sessions.length ? <div className="tr-list">{sessions.map(s => <details key={s.id} className="tr-item">
      <summary><strong>{s.name}</strong><time dateTime={s.date}>{dateFormat.format(new Date(s.date))}</time>
        <span>{s.movements.reduce((n, m) => n + m.sets.length, 0)} sets</span></summary>
      <div className="tr-item-body">{s.movements.map((m, i) => <div className="tr-history-move" key={i}><h3>{m.name}</h3>
        <ol>{m.sets.map((set, j) => <li key={j}>Set {j + 1} · {set.quantity} {m.unit}{set.weight !== null && " · " + set.weight + " lb"}</li>)}</ol>
      </div>)}{s.notes && <p className="tr-notes">{s.notes}</p>}</div>
    </details>)}</div> : <div className="tr-empty"><h2>Your log is empty</h2><p>Choose a workout and log your first set. Your completed sessions will appear here.</p></div>}
  </>;
}
