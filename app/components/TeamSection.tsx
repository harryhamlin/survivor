// Wraps the team picker and roster: decides which to show, and (while still
// unlocked) lets a user with an existing team switch into an editable
// picker pre-filled with their current picks. Deadline/lock messaging lives
// at the bottom of the dashboard page, not here — this only renders the box
// itself and its "edit team" link.
import { useEffect, useState } from "react";
import { TeamPicker } from "./TeamPicker";
import { TeamRoster } from "./TeamRoster";

export function TeamSection({
  team,
  contestants,
  finalistCount,
  isLocked,
  saveResult,
}: {
  team: {
    id: number;
    name: string;
    isUltimateSurvivor: boolean;
    eliminated: boolean;
  }[];
  contestants: { id: number; name: string }[];
  finalistCount: number;
  isLocked: boolean;
  // A fresh object every time the draft action runs (even a resubmission of
  // an unchanged team), so this can drive closing the picker on success
  // without depending on `team` having actually changed — undefined outside
  // of just having submitted the draft form.
  saveResult?: { success?: boolean; error?: string };
}) {
  const hasTeam = team.length > 0;
  // No team yet -> start straight in the picker. Already has a team -> start
  // on the read-only roster, with an "edit team" button to switch over
  // (unless locked, in which case editing is off the table).
  const [editing, setEditing] = useState(!hasTeam);

  // Switches back to the read-only roster once a save succeeds — keyed off
  // object identity (a new `saveResult` every submission) rather than
  // whether `team` itself changed, so this fires even when the saved
  // picks are identical to what was already there.
  useEffect(() => {
    if (saveResult?.success) {
      setEditing(false);
    }
  }, [saveResult]);

  // Nothing to show — the bottom-of-page disclaimer explains why.
  if (!hasTeam && isLocked) {
    return null;
  }

  if (hasTeam && !editing) {
    return (
      <div className="space-y-2">
        <TeamRoster team={team} />
        {!isLocked && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-primary/70 hover:underline"
          >
            edit team
          </button>
        )}
      </div>
    );
  }

  return (
    <TeamPicker
      contestants={contestants}
      finalistCount={finalistCount}
      initialSelectedIds={team.map((member) => member.id)}
      initialUltimateSurvivorId={
        team.find((member) => member.isUltimateSurvivor)?.id ?? null
      }
      error={saveResult?.error}
    />
  );
}
