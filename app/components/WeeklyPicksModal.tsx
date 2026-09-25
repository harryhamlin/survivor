// A prominent button + modal for the week's two predictions: who gets voted
// out, and who wins immunity. Submits to the dashboard route's action (see
// the `intent` field) rather than having a page of its own.
import { useState } from "react";
import { Form } from "react-router";

export function WeeklyPicksModal({
  contestants,
  currentPicks,
  isLocked,
  deadlineLabel,
  reopenDayLabel,
  error,
}: {
  contestants: { id: number; contestant_name: string }[];
  currentPicks: { eliminatedId: number; immunityWinnerId: number } | null;
  isLocked: boolean;
  deadlineLabel: string;
  reopenDayLabel: string | null;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  // Pre-fill with whatever the user already picked this week, if anything.
  const [eliminatedId, setEliminatedId] = useState<number | "">(
    currentPicks?.eliminatedId ?? "",
  );
  const [immunityWinnerId, setImmunityWinnerId] = useState<number | "">(
    currentPicks?.immunityWinnerId ?? "",
  );

  const sameContestantTwice =
    eliminatedId !== "" && eliminatedId === immunityWinnerId;
  const canSubmit =
    eliminatedId !== "" && immunityWinnerId !== "" && !sameContestantTwice;

  if (isLocked) {
    return (
      <p className="border border-primary/40 px-4 py-4 text-center text-primary/70">
        This week&apos;s picks locked at {deadlineLabel}. They reopen{" "}
        {reopenDayLabel}.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full bg-primary px-4 py-4 text-lg font-semibold text-black hover:opacity-90"
      >
        make my weekly picks
      </button>
      <p className="text-center text-sm text-primary/70">
        Picks lock every week on {deadlineLabel}
      </p>

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
            aria-labelledby="weekly-picks-title"
            className="w-full max-w-sm space-y-4 border border-primary/40 bg-background p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2
                id="weekly-picks-title"
                className="text-lg font-semibold text-primary"
              >
                weekly picks
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
            <Form method="post" className="space-y-4">
              {/* Distinguishes this submission from the team picker's, since
                  both post to the same dashboard route — see the route's
                  action. */}
              <input type="hidden" name="intent" value="weekly-picks" />
              <div className="space-y-1">
                <label
                  htmlFor="eliminatedId"
                  className="block text-sm text-primary/70"
                >
                  who will be voted out this week?
                </label>
                <select
                  id="eliminatedId"
                  name="eliminatedId"
                  required
                  value={eliminatedId}
                  onChange={(event) =>
                    setEliminatedId(Number(event.target.value))
                  }
                  className="w-full border border-primary/40 bg-background px-3 py-2 text-primary"
                >
                  <option value="" disabled>
                    select a contestant
                  </option>
                  {contestants.map((contestant) => (
                    <option key={contestant.id} value={contestant.id}>
                      {contestant.contestant_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="immunityWinnerId"
                  className="block text-sm text-primary/70"
                >
                  who will win immunity?
                </label>
                <select
                  id="immunityWinnerId"
                  name="immunityWinnerId"
                  required
                  value={immunityWinnerId}
                  onChange={(event) =>
                    setImmunityWinnerId(Number(event.target.value))
                  }
                  className="w-full border border-primary/40 bg-background px-3 py-2 text-primary"
                >
                  <option value="" disabled>
                    select a contestant
                  </option>
                  {contestants.map((contestant) => (
                    <option key={contestant.id} value={contestant.id}>
                      {contestant.contestant_name}
                    </option>
                  ))}
                </select>
              </div>
              {sameContestantTwice && (
                <p className="text-sm text-red-500">
                  pick two different contestants
                </p>
              )}
              {/* Set by the dashboard action if the save failed server-side. */}
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-black hover:opacity-90 disabled:opacity-40"
              >
                save picks
              </button>
            </Form>
          </div>
        </div>
      )}
    </>
  );
}
