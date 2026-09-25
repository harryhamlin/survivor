// A link + modal, self-contained: clicking "Scoring metrics" opens an
// overlay with the scoring rules. Purely client-side state (open/closed) —
// no server round trip needed for this.
import { useState } from "react";

export function ScoringMetricsModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm text-primary/70 hover:underline"
        >
          Scoring metrics
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
            aria-labelledby="scoring-metrics-title"
            className="w-full max-w-sm space-y-4 border border-primary/40 bg-background p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2
                id="scoring-metrics-title"
                className="text-lg font-semibold text-primary"
              >
                Scoring metrics
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
            <div className="space-y-3 text-primary/80">
              <div>
                <p className="font-medium text-primary">Final 3</p>
                <p className="text-sm">
                  Scored only once, at the end of the season — not week by
                  week.
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                  <li>
                    +4 points for each of your team&apos;s picks who makes
                    the final 3.
                  </li>
                  <li>
                    +4 bonus points if your Ultimate Survivor pick wins the
                    season.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
