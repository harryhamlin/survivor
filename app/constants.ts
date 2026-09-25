// Shared app-wide constants. Keeping this separate from any one route means
// both the UI (TeamPicker) and the server-side validation (dashboard action)
// read the same value instead of two numbers drifting out of sync.

// Number of contestants a user must pick to form a valid team.
export const TEAM_SIZE = 3;
