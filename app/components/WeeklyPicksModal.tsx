// The week's two predictions: who gets voted out, and who wins immunity.
// Mirrors TeamSection's pattern — a prominent button before any picks exist,
// a standalone read-only box with an "edit weekly picks" link once they do —
// with the actual form living in a modal either way. Submits to the
// dashboard route's action (see the `intent` field) rather than having a
// page of its own.
import { useState } from "react";
import { Form } from "react-router";
import { IN_SHOW_TEAMS, type InShowTeam } from "../constants";

export function WeeklyPicksModal({
  contestants,
  currentPicks,
  error,
}: {
  contestants: { id: number; contestant_name: string }[];
  currentPicks: {
    eliminatedId: number;
    eliminatedName: string;
    immunityWinnerTeam: string;
  } | null;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  // Pre-fill with whatever the user already picked this week, if anything.
  const [eliminatedId, setEliminatedId] = useState<number | "">(
    currentPicks?.eliminatedId ?? "",
  );
  const [immunityWinnerTeam, setImmunityWinnerTeam] = useState<
    InShowTeam | ""
  >((currentPicks?.immunityWinnerTeam as InShowTeam) ?? "");

  const canSubmit = eliminatedId !== "" && immunityWinnerTeam !== "";

  return (
    <div className="space-y-4">
      {!open &&
        (currentPicks ? (
          <div className="space-y-2">
            <p className="text-sm text-primary/70">your weekly picks</p>
            <div className="space-y-1 border border-primary/40 p-4">
              <p className="text-primary">
                voted out: {currentPicks.eliminatedName}
              </p>
              <p className="text-primary capitalize">
                immunity: {currentPicks.immunityWinnerTeam}
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
                <span className="block text-sm text-primary/70">
                  which team will win immunity?
                </span>
                <input
                  type="hidden"
                  name="immunityWinnerTeam"
                  value={immunityWinnerTeam}
                />
                <div className="grid grid-cols-2 gap-2">
                  {IN_SHOW_TEAMS.map((team) => (
                    <button
                      key={team}
                      type="button"
                      onClick={() => setImmunityWinnerTeam(team)}
                      aria-pressed={immunityWinnerTeam === team}
                      className={`border px-3 py-2 capitalize ${
                        immunityWinnerTeam === team
                          ? "border-primary bg-primary text-black"
                          : "border-primary/40 text-primary hover:border-primary"
                      }`}
                    >
                      {team}
                    </button>
                  ))}
                </div>
              </div>
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
