// Presentational component for the "/scores" page: a spreadsheet-style
// table wide enough to need horizontal scrolling once there are several
// weeks of picks. The username column stays pinned in place while the rest
// scrolls underneath it (`sticky left-0` on both the header and body cells,
// with an explicit background so scrolled-past columns don't show through).
// Pure markup — all the data comes from the scores route's loader.
import { Link } from "react-router";

type Pick = { eliminatedName: string; immunityWinnerName: string } | null;

export function DetailedScores({
  weeks,
  rows,
}: {
  weeks: number[];
  rows: {
    username: string;
    cumulativeScore: number;
    team: string[];
    picks: Pick[];
  }[];
}) {
  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-primary">
            detailed scores
          </h1>
          <Link
            to="/dashboard"
            className="text-sm text-primary/70 hover:underline"
          >
            back to dashboard
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="text-primary/70">No players yet</p>
        ) : (
          <div className="overflow-x-auto border border-primary/40">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[140px] border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary">
                    username
                  </th>
                  <th className="min-w-[220px] border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary">
                    team
                  </th>
                  <th className="min-w-[100px] border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary">
                    score
                  </th>
                  {weeks.map((week) => (
                    <th
                      key={week}
                      className="min-w-[220px] border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary last:border-r-0"
                    >
                      week {week}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.username}>
                    <td className="sticky left-0 z-10 border-b border-r border-primary/40 bg-background px-3 py-2 text-primary">
                      {row.username}
                    </td>
                    <td className="border-b border-r border-primary/40 px-3 py-2 text-primary">
                      {row.team.length > 0 ? row.team.join(", ") : "—"}
                    </td>
                    <td className="border-b border-r border-primary/40 px-3 py-2 text-primary">
                      {row.cumulativeScore}
                    </td>
                    {row.picks.map((pick, index) => (
                      <td
                        key={weeks[index]}
                        className="border-b border-r border-primary/40 px-3 py-2 text-primary/70 last:border-r-0"
                      >
                        {pick ? (
                          <>
                            out: {pick.eliminatedName}
                            <br />
                            imm: {pick.immunityWinnerName}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
