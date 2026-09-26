// Presentational component for the "/leaderboard" page: a spreadsheet-style
// table wide enough to need horizontal scrolling once there are several
// episodes of picks. The player column stays pinned in place while the rest
// scrolls underneath it (`sticky left-0` on both the header and body cells,
// with an explicit background so scrolled-past columns don't show through).
// Pure markup — all the data comes from the leaderboard route's loader.
import { TopBanner } from "./TopBanner";

type Pick = {
  eliminationPickName: string;
  immunityTribePickName: string;
} | null;

export function DetailedScores({
  username,
  episodeNumbers,
  rows,
}: {
  username: string;
  episodeNumbers: number[];
  rows: {
    playerId: number;
    displayName: string;
    score: number;
    team: string[];
    ultimatePick: string | null;
    picks: Pick[];
  }[];
}) {
  return (
    <main className="min-h-screen bg-background">
      <TopBanner username={username} page="leaderboard" />
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-12">
        <h1 className="text-2xl font-semibold text-primary">leaderboard</h1>

        {rows.length === 0 ? (
          <p className="text-primary/70">No players yet</p>
        ) : (
          <div className="w-fit max-w-full overflow-x-auto border border-primary/40">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[180px] border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary">
                    player
                  </th>
                  <th className="min-w-[100px] border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary">
                    score
                  </th>
                  <th className="min-w-[260px] border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary">
                    final 3
                  </th>
                  {/* No min-width here (unlike the other columns) — this one
                      is left to size itself to its longest line ("out: name"
                      or "imm: tribe") instead of a fixed floor. */}
                  {episodeNumbers.map((episodeNumber) => (
                    <th
                      key={episodeNumber}
                      className="whitespace-nowrap border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary last:border-r-0"
                    >
                      episode {episodeNumber}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.playerId}>
                    <td className="sticky left-0 z-10 border-b border-r border-primary/40 bg-background px-3 py-2 text-primary">
                      {row.displayName}
                    </td>
                    <td className="border-b border-r border-primary/40 px-3 py-2 text-primary">
                      {row.score}
                    </td>
                    <td className="border-b border-r border-primary/40 px-3 py-2 text-primary">
                      {row.team.length > 0 ? (
                        // team is already ordered ultimate pick first (see
                        // the leaderboard route's query), so stacking in
                        // that order puts it on top with no extra sorting
                        // here.
                        <div className="space-y-0.5">
                          {row.team.map((name) => (
                            <div key={name}>
                              {name}
                              {name === row.ultimatePick && (
                                <span className="text-primary/70">
                                  {" "}
                                  (ultimate survivor)
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    {row.picks.map((pick, index) => (
                      <td
                        key={episodeNumbers[index]}
                        className="whitespace-nowrap border-b border-r border-primary/40 px-3 py-2 text-primary/70 last:border-r-0"
                      >
                        {pick ? (
                          <>
                            out: {pick.eliminationPickName}
                            <br />
                            imm: {pick.immunityTribePickName}
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
