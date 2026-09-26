// Shown on the dashboard when the logged-in user doesn't have a team yet.
// Lets them check exactly `finalistCount` contestants (the season's
// finalist_count — see db/schema.sql), designate one of them as their
// "Ultimate Survivor" pick, and submit to create their team (handled by the
// dashboard route's `action`).
import { useEffect, useState } from "react";
import { Form } from "react-router";

export function TeamPicker({
  contestants,
  finalistCount,
  initialSelectedIds = [],
  initialUltimateSurvivorId = null,
  error,
}: {
  contestants: { id: number; name: string }[];
  // How many contestants must be drafted — the season's finalist_count (see
  // db/schema.sql), fetched per-season rather than a hardcoded constant.
  finalistCount: number;
  // Pre-fills the form when editing an already-saved team, rather than
  // starting from an empty selection.
  initialSelectedIds?: number[];
  initialUltimateSurvivorId?: number | null;
  error?: string;
}) {
  // Client-side selection state, used only to drive the UI (disabling
  // checkboxes past the limit, showing the live count, disabling submit).
  // The actual source of truth for validation is still the server-side
  // action — this is just so the user gets instant feedback instead of a
  // round trip.
  const [selected, setSelected] = useState<number[]>(initialSelectedIds);
  const [ultimateSurvivorId, setUltimateSurvivorId] = useState<number | null>(
    initialUltimateSurvivorId,
  );

  // If a contestant gets unchecked after being picked as the Ultimate
  // Survivor, that pick no longer makes sense — clear it so the form can't
  // submit an ultimateSurvivorId that isn't one of the selected contestants.
  useEffect(() => {
    if (ultimateSurvivorId !== null && !selected.includes(ultimateSurvivorId)) {
      setUltimateSurvivorId(null);
    }
  }, [selected, ultimateSurvivorId]);

  // Checks/unchecks a contestant, refusing to add another once
  // finalistCount are already selected.
  function toggle(id: number) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < finalistCount
          ? [...prev, id]
          : prev,
    );
  }

  const selectedContestants = contestants.filter((contestant) =>
    selected.includes(contestant.id),
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-primary/70">
        Set your initial line-up for the season
      </p>
      <p className="text-sm text-primary/70">
        Pick {finalistCount} contestants ({selected.length}/{finalistCount}{" "}
        selected)
      </p>
      <Form method="post" className="space-y-6">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {contestants.map((contestant) => {
            const checked = selected.includes(contestant.id);
            // Disable any checkbox that isn't already checked once the
            // limit is reached, so the browser physically can't submit more
            // than finalistCount ids.
            const disabled = !checked && selected.length >= finalistCount;
            return (
              <label
                key={contestant.id}
                className={`flex items-center gap-2 border px-3 py-2 text-sm ${
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
                <span className="text-primary">{contestant.name}</span>
              </label>
            );
          })}
        </div>

        {/* Only shows up once the roster is full — picking an Ultimate
            Survivor from a still-changing list would be confusing. */}
        {selected.length === finalistCount && (
          <div className="space-y-2">
            <p className="text-sm text-primary/70">
              Who&apos;s your Ultimate Survivor?
            </p>
            <div className="space-y-2">
              {selectedContestants.map((contestant) => (
                <label
                  key={contestant.id}
                  className="flex cursor-pointer items-center gap-2 border border-primary/40 px-3 py-2 text-sm"
                >
                  {/* A radio group (not checkboxes) since exactly one
                      contestant must be the Ultimate Survivor pick. */}
                  <input
                    type="radio"
                    name="ultimateSurvivorId"
                    value={contestant.id}
                    checked={ultimateSurvivorId === contestant.id}
                    onChange={() => setUltimateSurvivorId(contestant.id)}
                    className="accent-primary"
                  />
                  <span className="text-primary">{contestant.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Set by the dashboard action if the save failed server-side
            (e.g. a race where a team already exists). */}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={selected.length !== finalistCount || ultimateSurvivorId === null}
          className="w-full rounded-lg bg-primary px-3 py-2 font-medium text-black hover:opacity-90 disabled:opacity-40"
        >
          Save team
        </button>
      </Form>
    </div>
  );
}
