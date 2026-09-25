// Shown on the dashboard once the logged-in user has already picked a team:
// their join date and their chosen contestants. Purely presentational — all
// the data comes from the dashboard route's loader.
export function TeamRoster({
  createdAt,
  team,
}: {
  createdAt: string;
  team: { name: string; isUltimateSurvivor: boolean }[];
}) {
  return (
    <>
      <div className="border border-primary/40 p-4">
        <p className="mb-2 text-sm text-primary/70">your final 3</p>
        <ul className="space-y-1">
          {team.map((member) => (
            <li key={member.name} className="text-lg text-primary">
              {member.name}
              {member.isUltimateSurvivor && (
                <span className="ml-2 text-sm text-primary/70">
                  (ultimate survivor)
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
