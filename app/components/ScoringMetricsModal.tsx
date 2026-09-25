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
            className="w-full max-w-sm space-y-4 rounded-xl border border-primary/40 bg-background p-6"
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
            {/* Placeholder until real scoring rules are written. */}
            <p className="text-primary/80">test rules</p>
          </div>
        </div>
      )}
    </>
  );
}
