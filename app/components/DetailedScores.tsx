// Presentational component for the "/leaderboard" page: a spreadsheet-style
// table wide enough to need horizontal scrolling once there are several
// episodes of picks. The player column stays pinned in place while the rest
// scrolls underneath it (`sticky left-0` on both the header and body cells,
// with an explicit background so scrolled-past columns don't show through).
// Pure markup — all the data comes from the leaderboard route's loader.
import { TopBanner } from "./TopBanner";
import { ScoreOverviewModal } from "./ScoreOverviewModal";
import type {
  WeeklyPickBreakdownRow,
  FinalThreeBreakdownRow,
} from "../scoring.server";

type Pick = {
  eliminationPickName: string | null;
  eliminationCorrect: boolean | null;
  immunityPickName: string | null;
  immunityCorrect: boolean | null;
} | null;

// Green once a pick is confirmed correct, red once confirmed incorrect, and
// the same neutral color as before while that category hasn't been graded
// yet (`correct` is null — either still pending, or voided) — see
// isPredictionCorrect in scoring.server.ts for what "correct" means.
function pickColorClass(correct: boolean | null): string {
  if (correct === true) return "text-primary";
  if (correct === false) return "text-red-500";
  return "text-primary/70";
}

export function DetailedScores({
  displayName,
  episodeNumbers,
  rows,
  scoreBreakdown,
}: {
  displayName: string;
  episodeNumbers: number[];
  rows: {
    playerId: number;
    rank: number;
    displayName: string;
    score: number;
    maxPossibleScore: number;
    team: { name: string; eliminated: boolean }[];
    ultimatePick: string | null;
    picks: Pick[];
  }[];
  scoreBreakdown: {
    weeklyPicks: WeeklyPickBreakdownRow[];
    finalThree: FinalThreeBreakdownRow[];
    totalScore: number;
  };
}) {
  return (
    <main className="min-h-screen bg-background">
      <TopBanner displayName={displayName} page="leaderboard" />
      <div className="mx-auto max-w-5xl space-y-8 px-4 py-12">
        <h1 className="text-2xl font-semibold text-primary">leaderboard</h1>

        {rows.length === 0 ? (
          <p className="text-primary/70">No players yet</p>
        ) : (
          <div className="w-fit max-w-full overflow-x-auto border border-primary/40">
            <table className="border-collapse text-sm">
              <thead>
                <tr>
                  <th className="whitespace-nowrap border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary">
                    rank
                  </th>
                  {/* The right edge uses a box-shadow instead of border-r —
                      a `border-collapse` table's collapsed borders don't
                      reliably stay pinned to a `sticky` cell while scrolling
                      in every browser, but a box-shadow (outside the table
                      border model entirely) always travels with it. */}
                  <th className="sticky left-0 z-10 min-w-[140px] whitespace-nowrap border-b border-primary/40 bg-background px-3 py-2 text-left text-primary shadow-[1px_0_0_0_color-mix(in_oklab,var(--color-primary)_40%,transparent)]">
                    player
                  </th>
                  {/* A plain border-l here (rather than relying only on the
                      player column's box-shadow) is what actually guarantees
                      a visible dividing line at rest — the box-shadow exists
                      purely to survive horizontal scroll, not to double as
                      this column's left border. */}
                  <th className="min-w-[140px] whitespace-nowrap border-b border-l border-r border-primary/40 bg-background px-3 py-2 text-left text-primary">
                    score
                  </th>
                  <th
                    title="Projected total with all remaining picks correct. Unknown rounds assume one elimination and individual immunity through Final 3."
                    className="min-w-[160px] whitespace-nowrap border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary"
                  >
                    max possible score
                  </th>
                  <th className="min-w-[260px] whitespace-nowrap border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary">
                    final 3
                  </th>
                  {episodeNumbers.map((episodeNumber) => (
                    <th
                      key={episodeNumber}
                      className="min-w-[140px] whitespace-nowrap border-b border-r border-primary/40 bg-background px-3 py-2 text-left text-primary last:border-r-0"
                    >
                      episode {episodeNumber}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.playerId}>
                    <td className="whitespace-nowrap border-b border-r border-primary/40 px-3 py-2 text-primary">
                      {row.rank}
                    </td>
                    <td className="sticky left-0 z-10 whitespace-nowrap border-b border-primary/40 bg-background px-3 py-2 text-primary shadow-[1px_0_0_0_color-mix(in_oklab,var(--color-primary)_40%,transparent)]">
                      {row.displayName}
                    </td>
                    <td className="whitespace-nowrap border-b border-l border-r border-primary/40 px-3 py-2 text-primary">
                      {row.score}
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-primary/40 px-3 py-2 text-primary">
                      {row.maxPossibleScore}
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-primary/40 px-3 py-2 text-primary">
                      {row.team.length > 0 ? (
                        // team is already ordered ultimate pick first (see
                        // the leaderboard route's query), so stacking in
                        // that order puts it on top with no extra sorting
                        // here.
                        <div className="space-y-0.5">
                          {row.team.map(({ name, eliminated }) => (
                            <div
                              key={name}
                              className={eliminated ? "text-red-500" : "text-primary"}
                            >
                              {name}
                              {name === row.ultimatePick && (
                                <span className={eliminated ? "text-red-500" : "text-primary/70"}>
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
                        className="whitespace-nowrap border-b border-r border-primary/40 px-3 py-2 last:border-r-0"
                      >
                        {pick ? (
                          <>
                            <span className={pickColorClass(pick.eliminationCorrect)}>
                              out: {pick.eliminationPickName ?? "—"}
                            </span>
                            <br />
                            <span className={pickColorClass(pick.immunityCorrect)}>
                              imm: {pick.immunityPickName ?? "—"}
                            </span>
                          </>
                        ) : (
                          <span className="text-primary/70">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ScoreOverviewModal
          weeklyPicks={scoreBreakdown.weeklyPicks}
          finalThree={scoreBreakdown.finalThree}
          totalScore={scoreBreakdown.totalScore}
        />
      </div>
    </main>
  );
}
