// The episode's two predictions: who gets voted out, and who (or which
// tribe) wins immunity — which one depends on this episode's immunityType
// (pre-merge tribe immunity vs. post-merge individual immunity). Mirrors
// TeamSection's pattern — a prominent button before any picks exist, a
// standalone read-only box with an "edit weekly picks" link once they do —
// with the actual form living in a modal either way. Submits to the
// dashboard route's action (see the `intent` field) rather than having a
// page of its own.
import { useState } from "react";
import { Form } from "react-router";

// Picks white or black text for readability against an arbitrary tribe
// color — tribes.color may not even be a hex value yet (the seed data still
// uses plain names like "yellow"/"purple"), in which case this just falls
// back to black.
function getContrastTextColor(color: string): string {
  const hexMatch = /^#?([0-9a-fA-F]{6})$/.exec(color);
  if (!hexMatch) return "#000";
  const hex = hexMatch[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#000" : "#fff";
}

export function WeeklyPicksModal({
  contestants,
  tribes,
  immunityType,
  currentPicks,
  error,
}: {
  contestants: { id: number; name: string }[];
  tribes: { id: number; name: string; color: string }[];
  immunityType: "tribe" | "individual";
  currentPicks: {
    eliminationPickId: number;
    eliminationPickName: string;
    immunityPickId: number;
    immunityPickName: string;
  } | null;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  // Pre-fill with whatever the player already picked for this episode, if
  // anything.
  const [eliminationPickId, setEliminationPickId] = useState<number | "">(
    currentPicks?.eliminationPickId ?? "",
  );
  // One field regardless of immunityType — it's submitted as
  // `immunityPickId` either way, and the dashboard action is what decides
  // whether that id means a tribe or a contestant (see
  // episodes.immunity_type in db/schema.sql).
  const [immunityPickId, setImmunityPickId] = useState<number | "">(
    currentPicks?.immunityPickId ?? "",
  );

  const canSubmit = eliminationPickId !== "" && immunityPickId !== "";

  return (
    <div className="space-y-4">
      {!open &&
        (currentPicks ? (
          <div className="space-y-2">
            <p className="text-sm text-primary/70">your weekly picks</p>
            <div className="space-y-1 border border-primary/40 p-4">
              <p className="text-primary">
                voted out: {currentPicks.eliminationPickName}
              </p>
              <p className="text-primary">
                immunity: {currentPicks.immunityPickName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-sm text-primary/70 hover:underline"
            >
              edit weekly picks
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full bg-primary px-4 py-4 text-lg font-semibold text-black hover:opacity-90"
          >
            make my weekly picks
          </button>
        ))}

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
              {/* Distinguishes this submission from the draft picker's,
                  since both post to the same dashboard route — see the
                  route's action. */}
              <input type="hidden" name="intent" value="weekly-picks" />
              <div className="space-y-1">
                <label
                  htmlFor="eliminationPickId"
                  className="block text-sm text-primary/70"
                >
                  who will be voted out this week?
                </label>
                <select
                  id="eliminationPickId"
                  name="eliminationPickId"
                  required
                  value={eliminationPickId}
                  onChange={(event) =>
                    setEliminationPickId(Number(event.target.value))
                  }
                  className="w-full border border-primary/40 bg-background px-3 py-2 text-primary"
                >
                  <option value="" disabled>
                    select a contestant
                  </option>
                  {contestants.map((contestant) => (
                    <option key={contestant.id} value={contestant.id}>
                      {contestant.name}
                    </option>
                  ))}
                </select>
              </div>
              {immunityType === "tribe" ? (
                <div className="space-y-1">
                  <span className="block text-sm text-primary/70">
                    which tribe will win immunity?
                  </span>
                  <input
                    type="hidden"
                    name="immunityPickId"
                    value={immunityPickId}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {tribes.map((tribe) => (
                      <button
                        key={tribe.id}
                        type="button"
                        onClick={() => setImmunityPickId(tribe.id)}
                        aria-pressed={immunityPickId === tribe.id}
                        style={
                          immunityPickId === tribe.id
                            ? {
                                backgroundColor: tribe.color,
                                borderColor: tribe.color,
                                color: getContrastTextColor(tribe.color),
                              }
                            : { borderColor: tribe.color, color: tribe.color }
                        }
                        className="border px-3 py-2 hover:opacity-80"
                      >
                        {tribe.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <label
                    htmlFor="immunityPickId"
                    className="block text-sm text-primary/70"
                  >
                    who will win individual immunity?
                  </label>
                  <select
                    id="immunityPickId"
                    name="immunityPickId"
                    required
                    value={immunityPickId}
                    onChange={(event) =>
                      setImmunityPickId(Number(event.target.value))
                    }
                    className="w-full border border-primary/40 bg-background px-3 py-2 text-primary"
                  >
                    <option value="" disabled>
                      select a contestant
                    </option>
                    {contestants.map((contestant) => (
                      <option key={contestant.id} value={contestant.id}>
                        {contestant.name}
                      </option>
                    ))}
                  </select>
                </div>
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
    </div>
  );
}
