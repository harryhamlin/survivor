// Pacific-time lock rules for the season. No timezone library is used —
// formatting "now" into Pacific and reparsing it is a common lightweight
// trick to get wall-clock time in a specific timezone out of a plain Date,
// and it correctly accounts for PST/PDT on its own.
function pacificNow(): Date {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
}

// One-time, permanent deadline for the initial 3-person team draft. This is
// a fixed literal — NOT "the next 8pm Pacific from whenever this code
// happens to run" — because a deadline recomputed relative to "now" on every
// request would just keep sliding forward and could never actually become
// permanently in the past. Computed once as the next 8pm Pacific from the
// moment this was written (Friday 2026-09-25, ~1:54 PM Pacific), i.e.
// 8:00 PM PDT that same day. Edit this literal directly if the real
// deadline turns out to be different.
export const TEAM_LOCK_DEADLINE = new Date("2026-09-26T03:00:00.000Z");

export function isTeamLocked(): boolean {
  return Date.now() >= TEAM_LOCK_DEADLINE.getTime();
}

// A real, correctly-anchored instant (unlike the recurring weekly deadline
// below) can safely be formatted with a normal timezone-aware Intl call.
export const TEAM_LOCK_DEADLINE_LABEL = TEAM_LOCK_DEADLINE.toLocaleString(
  "en-US",
  {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
);

// The weekly elimination/immunity picks lock every WEEKLY_LOCK_DAY at
// WEEKLY_LOCK_HOUR:00 Pacific, then re-open automatically once that day has
// passed. Defaults to Wednesday, matching Survivor's usual US broadcast
// night — this is an assumption, not something the user specified; change
// WEEKLY_LOCK_DAY if the real air day differs.
const WEEKLY_LOCK_DAY = 3; // getDay(): 0 = Sunday, 3 = Wednesday
const WEEKLY_LOCK_HOUR = 20; // 8 PM, 24-hour clock

export function isWeeklyPicksLocked(): boolean {
  const now = pacificNow();
  return now.getDay() === WEEKLY_LOCK_DAY && now.getHours() >= WEEKLY_LOCK_HOUR;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// `pacificNow()`'s Date is a synthetic stand-in for Pacific wall-clock time
// (see the comment above it) — its epoch value isn't a real instant, so it's
// formatted manually from its day/hour/minute fields rather than passed to
// Intl, which would need a genuine instant to convert correctly.
function formatPacificDayTime(date: Date): string {
  const hour24 = date.getHours();
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const ampm = hour24 < 12 ? "AM" : "PM";
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${WEEKDAY_NAMES[date.getDay()]} at ${hour12}:${minutes} ${ampm} Pacific`;
}

// The next upcoming lock time — useful to show "locks ___" while picks are
// still open. Rolls forward a full week if it's already past this week's
// lock time on the lock day itself.
function getWeeklyPicksDeadline(): Date {
  const now = pacificNow();
  const deadline = new Date(now);
  deadline.setHours(WEEKLY_LOCK_HOUR, 0, 0, 0);
  let daysUntilLockDay = (WEEKLY_LOCK_DAY - now.getDay() + 7) % 7;
  if (daysUntilLockDay === 0 && now >= deadline) {
    daysUntilLockDay = 7;
  }
  deadline.setDate(now.getDate() + daysUntilLockDay);
  return deadline;
}

export function getWeeklyPicksDeadlineLabel(): string {
  return formatPacificDayTime(getWeeklyPicksDeadline());
}

// Only meaningful while actually locked: picks re-open at midnight Pacific,
// right after the lock day ends (see isWeeklyPicksLocked's window above).
export function getWeeklyPicksReopenDayLabel(): string {
  const now = pacificNow();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return WEEKDAY_NAMES[tomorrow.getDay()];
}
