export const trainingPath = "/workouts";
export const maxLoggedSets = 16;
export const trainingHost = "workouts.torchsnuffers.com";
export const movementFocuses = ["Push", "Pull", "Legs", "Core", "PT", "Cardio"] as const;
export const trainingGoals = ["Power", "Strength", "Endurance", "Cardiovascular"] as const;
export const muscleGroups = [
  "Chest", "Shoulders", "Triceps", "Biceps", "Forearms", "Lats", "Upper back",
  "Lower back", "Abs", "Obliques", "Glutes", "Quads", "Hamstrings", "Calves",
  "Hip flexors", "Adductors", "Abductors",
] as const;
export const exerciseUnits = ["reps", "seconds", "minutes"] as const;
export const unitLabels = { reps: "Reps", seconds: "Seconds", minutes: "Minutes" } as const;
export const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export interface TrainingFocus {
  focus: (typeof movementFocuses)[number];
  goals: (typeof trainingGoals)[number][];
  muscle_groups: (typeof muscleGroups)[number][];
}

export interface Exercise extends TrainingFocus {
  author_name: string;
  id: string;
  name: string;
  unit: (typeof exerciseUnits)[number];
}
export interface PlannedExercise extends Exercise {
  position: number;
}
export function loggingUnit(exercise: Pick<Exercise, "unit" | "focus">) {
  return exercise.focus === "Cardio" && exercise.unit === "reps" ? "minutes" : exercise.unit;
}
// The weekly plan's "switch to" value that clears a day instead of naming an exercise.
export const restChoice = "rest";
export interface RecordedMovement {
  // Older session snapshots identify the exercise by name, author and unit.
  exercise_id?: string;
  author_name: string;
  name: string;
  unit: Exercise["unit"];
  sets: ({ quantity: number; weight: number | null } | { quantity: number; watts: number | null })[];
}

// Calendar dates are ISO strings (YYYY-MM-DD) handled in UTC so the arithmetic never shifts a day.
const parseDate = (date: string) => new Date(date + "T00:00:00Z");
export const isoDate = (date: Date) => date.toISOString().slice(0, 10);
export function addDays(date: string, days: number) {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}
// ISO weekday: Monday = 1 … Sunday = 7, matching the weekly plan.
export const dayOfWeek = (date: string) => ((parseDate(date).getUTCDay() + 6) % 7) + 1;
export const weekStart = (date: string) => addDays(date, 1 - dayOfWeek(date));
export function localToday() {
  const now = new Date();
  return isoDate(new Date(now.getTime() - now.getTimezoneOffset() * 60000));
}
export const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const formatDate = (date: string) => shortDate.format(parseDate(date));
