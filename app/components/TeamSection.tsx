// Wraps the team picker and roster: decides which to show, and (while still
// unlocked) lets a user with an existing team switch into an editable
// picker pre-filled with their current picks.
import { useState } from "react";
import { TeamPicker } from "./TeamPicker";
import { TeamRoster } from "./TeamRoster";

export function TeamSection({
  createdAt,
  team,
  contestants,
  isLocked,
  lockDeadlineLabel,
  error,
}: {
  createdAt: string;
  team: { id: number; name: string; isUltimateSurvivor: boolean }[];
  contestants: { id: number; contestant_name: string }[];
  isLocked: boolean;
  lockDeadlineLabel: string;
  error?: string;
}) {
  const hasTeam = team.length > 0;
  // No team yet -> start straight in the picker. Already has a team -> start
  // on the read-only roster, with an "edit team" button to switch over
  // (unless locked, in which case editing is off the table).
  const [editing, setEditing] = useState(!hasTeam);

  if (!hasTeam && isLocked) {
    return (
      <p className="text-primary/70">
        Team selection closed {lockDeadlineLabel} — you didn&apos;t pick a
        team in time.
      </p>
    );
  }

  if (hasTeam && !editing) {
    return (
      <div className="space-y-4">
        <TeamRoster createdAt={createdAt} team={team} />
        {isLocked ? (
          <p className="text-sm text-primary/70">
            Your team locked {lockDeadlineLabel} and can no longer be
            changed.
          </p>
        ) : (
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-sm text-primary/70 hover:underline"
            >
              edit team
            </button>
            <p className="text-sm text-primary/70">
              You can change your team until {lockDeadlineLabel}, after which
              it locks forever.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <TeamPicker
        contestants={contestants}
        initialSelectedIds={team.map((member) => member.id)}
        initialUltimateSurvivorId={
          team.find((member) => member.isUltimateSurvivor)?.id ?? null
        }
        error={error}
      />
      <p className="text-sm text-primary/70">
        You can change your team until {lockDeadlineLabel}, after which it
        locks forever.
      </p>
    </div>
  );
}
