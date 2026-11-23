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
export interface Workout extends TrainingFocus {
  id: string;
  name: string;
  minutes: number;
  description: string;
}
export interface Movement extends Exercise {
  position: number;
  sets: number;
  target: number;
}
export interface RecordedMovement {
  author_name: string;
  name: string;
  unit: Exercise["unit"];
  sets: { quantity: number; weight: number | null }[];
}
