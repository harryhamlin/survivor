// Shown on the dashboard when the logged-in user doesn't have a team yet.
// Lets them check exactly TEAM_SIZE contestants and submit to create their
// team (handled by the dashboard route's `action`).
import { useState } from "react";
import { Form } from "react-router";
import { TEAM_SIZE } from "../constants";

export function TeamPicker({
  contestants,
  error,
}: {
  contestants: { id: number; contestant_name: string }[];
  error?: string;
}) {
  // Client-side selection state, used only to drive the UI (disabling
  // checkboxes past the limit, showing the live count, disabling submit).
  // The actual source of truth for validation is still the server-side
  // action — this is just so the user gets instant feedback instead of a
  // round trip.
  const [selected, setSelected] = useState<number[]>([]);

  // Checks/unchecks a contestant, refusing to add a 6th once TEAM_SIZE are
  // already selected.
  function toggle(id: number) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < TEAM_SIZE
          ? [...prev, id]
          : prev,
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-primary/70">
        Set your initial line-up for the season
      </p>
      <p className="text-sm text-primary/70">
        Pick {TEAM_SIZE} contestants ({selected.length}/{TEAM_SIZE} selected)
      </p>
      <Form method="post" className="space-y-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {contestants.map((contestant) => {
            const checked = selected.includes(contestant.id);
            // Disable any checkbox that isn't already checked once the
            // limit is reached, so the browser physically can't submit more
            // than TEAM_SIZE ids.
            const disabled = !checked && selected.length >= TEAM_SIZE;
            return (
              <label
                key={contestant.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  checked ? "border-primary bg-primary/10" : "border-primary/40"
                } ${disabled ? "opacity-40" : "cursor-pointer"}`}
              >
                {/* Every checked box submits its contestant id under the
                    same `contestantId` field name; the action reads them
                    all back with `formData.getAll("contestantId")`. */}
                <input
                  type="checkbox"
                  name="contestantId"
                  value={contestant.id}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(contestant.id)}
                  className="accent-primary"
                />
                <span className="text-primary">
                  {contestant.contestant_name}
                </span>
              </label>
            );
          })}
        </div>
        {/* Set by the dashboard action if the save failed server-side
            (e.g. a race where a team already exists). */}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={selected.length !== TEAM_SIZE}
          className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-black hover:opacity-90 disabled:opacity-40"
        >
          Save team
        </button>
      </Form>
    </div>
  );
}
