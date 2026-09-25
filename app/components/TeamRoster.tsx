// Shown on the dashboard once the logged-in user has already picked a team:
// their chosen contestants. Purely presentational — all the data comes from
// the dashboard route's loader.
export function TeamRoster({
  team,
}: {
  team: { name: string; isUltimateSurvivor: boolean; eliminated: boolean }[];
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-primary/70">your final 3</p>
      <div className="border border-primary/40 p-4">
        <ul className="space-y-1">
          {team.map((member) => (
            <li key={member.name} className="text-lg text-primary">
              {member.name}
              {member.isUltimateSurvivor && (
                <span className="ml-2 text-sm text-primary/70">
                  (ultimate survivor)
                </span>
              )}
              {member.eliminated && (
                <span className="ml-2 text-sm text-primary/70">
                  - eliminated
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
