export const trainingPath = "/workouts";
export const maxLoggedSets = 16;
export const trainingHost = "workouts.torchsnuffers.com";
export const focusAreas = ["Full body", "Upper body", "Lower body", "Core"] as const;
export const equipmentOptions = ["Bodyweight", "Dumbbell", "Barbell", "Resistance band", "Kettlebell", "Cable", "Machine", "Jump rope", "Other"];

export interface Exercise {
  id: string;
  name: string;
  focus: string;
  equipment: string;
  unit: "reps" | "seconds";
  cue: string;
  personal: boolean;
}
export interface Workout {
  id: string;
  name: string;
  focus: string;
  minutes: number;
  description: string;
  personal: boolean;
}
export interface Movement extends Exercise {
  position: number;
  sets: number;
  target: number;
}
export interface RecordedMovement {
  name: string;
  unit: Exercise["unit"];
  sets: { quantity: number; weight: number | null }[];
}
