// Shown on the dashboard once the logged-in user has already picked a team:
// their join date and their chosen contestants. Purely presentational — all
// the data comes from the dashboard route's loader.
export function TeamRoster({
  createdAt,
  team,
}: {
  createdAt: string;
  team: string[];
}) {
  return (
    <>
      <div className="rounded-xl border border-primary/40 p-4">
        <p className="text-sm text-primary/70">Member since</p>
        <p className="text-xl font-medium text-primary">
          {new Date(createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="rounded-xl border border-primary/40 p-4">
        <p className="mb-2 text-sm text-primary/70">Your team</p>
        <ul className="space-y-1">
          {team.map((name) => (
            <li key={name} className="text-lg text-primary">
              {name}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
