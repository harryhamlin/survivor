// A link + modal, self-contained: clicking "Score overview" opens a table
// of every element that's ever scored for this player — each episode's
// elimination/immunity picks, plus each drafted contestant's final-3
// result — and what it's worth. All the data comes from the dashboard
// route's loader (see getPlayerScoreBreakdown in scoring.server.ts); this
// only flattens it into table rows and handles the open/closed state.
import { useState } from "react";
import type {
  WeeklyPickBreakdownRow,
  FinalThreeBreakdownRow,
  ScoringStatus,
} from "../scoring.server";

function formatPoints(status: ScoringStatus, points: number | null): string {
  if (status === "pending") return "pending";
  if (status === "void") return "voided";
  return `+${points ?? 0}`;
}

export function ScoreOverviewModal({
  weeklyPicks,
  finalThree,
  totalScore,
}: {
  weeklyPicks: WeeklyPickBreakdownRow[];
  finalThree: FinalThreeBreakdownRow[];
  totalScore: number;
}) {
  const [open, setOpen] = useState(false);

  // Flattened into one row per scored element — two per episode
  // (elimination, immunity) plus one per drafted contestant — rather than
  // nested per-episode groups, so it's a single simple table.
  const rows = [
    ...weeklyPicks.flatMap((pick) => [
      {
        key: `${pick.episodeNumber}-elimination`,
        label: `Episode ${pick.episodeNumber} — elimination`,
        pickName: pick.eliminationPickName,
        status: pick.eliminationStatus,
        points: pick.eliminationPoints,
      },
      {
        key: `${pick.episodeNumber}-immunity`,
        label: `Episode ${pick.episodeNumber} — immunity`,
        pickName: pick.immunityPickName,
        status: pick.immunityStatus,
        points: pick.immunityPoints,
      },
    ]),
    // A final-3 pick has no pending/void status of its own — it's simply
    // undecided (no points either way yet) until the season knows this
    // contestant's final_placement, then it's a done deal one way or the
    // other.
    ...finalThree.map((pick) => ({
      key: `final-three-${pick.contestantName}`,
      label: pick.isUltimatePick ? "Final 3 (ultimate survivor)" : "Final 3",
      pickName: pick.contestantName,
      status: (pick.finalPlacement === null
        ? "pending"
        : "active") as ScoringStatus,
      points: pick.points,
    })),
  ];

  return (
    <>
      <div className="text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-primary/70 hover:underline"
        >
          Score overview
        </button>
      </div>

      {open && (
        // Clicking the dimmed backdrop closes the modal; clicking inside the
        // dialog itself must not (hence stopPropagation on the inner div).
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="score-overview-title"
            className="max-h-[80vh] w-full max-w-lg space-y-4 overflow-y-auto border border-primary/40 bg-background p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2
                id="score-overview-title"
                className="text-lg font-semibold text-primary"
              >
                Score overview
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-primary/70 hover:text-primary"
              >
                ✕
              </button>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-primary/70">
                Nothing to score yet — make your picks and draft your team
                first.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border-b border-primary/40 px-2 py-1 text-left text-primary">
                        item
                      </th>
                      <th className="border-b border-primary/40 px-2 py-1 text-left text-primary">
                        your pick
                      </th>
                      <th className="border-b border-primary/40 px-2 py-1 text-right text-primary">
                        points
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key}>
                        <td className="border-b border-primary/20 px-2 py-1 text-primary/80">
                          {row.label}
                        </td>
                        <td className="border-b border-primary/20 px-2 py-1 text-primary/80">
                          {row.pickName ?? "—"}
                        </td>
                        <td className="border-b border-primary/20 px-2 py-1 text-right text-primary/80">
                          {formatPoints(row.status, row.points)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={2} className="px-2 py-1 font-medium text-primary">
                        total
                      </td>
                      <td className="px-2 py-1 text-right font-medium text-primary">
                        {totalScore}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
