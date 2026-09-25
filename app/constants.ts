// Shared app-wide constants. Keeping this separate from any one route means
// both the UI (TeamPicker) and the server-side validation (dashboard action)
// read the same value instead of two numbers drifting out of sync.

// Number of contestants a user must pick to form a valid team.
export const TEAM_SIZE = 3;

// The two in-show tribes contestants are manually assigned to (see
// contestants.in_show_team in db/schema.sql). Mirrored as a CHECK constraint
// on weekly_picks.predicted_immunity_winner_team, so this is the one place
// to change if a tribe is renamed or a third is added.
export const IN_SHOW_TEAMS = ["yellow", "purple"] as const;
export type InShowTeam = (typeof IN_SHOW_TEAMS)[number];
