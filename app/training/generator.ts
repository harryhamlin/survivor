import { weekdays, type Exercise } from "./model";

export const dayKinds = ["Strength", "Endurance", "Rest"] as const;
export type DayKind = (typeof dayKinds)[number];
export const exerciseSources = ["random", "picks", "mix"] as const;
export type ExerciseSource = (typeof exerciseSources)[number];

export interface PlanRequest {
  strengthDays: number;
  enduranceDays: number;
  source: ExerciseSource;
  picks: string[];
  assignments: AssignedExercise[];
  // Weekdays the user wants kept free. Any other leftover days are placed as rest automatically.
  restDays: number[];
}
export interface GeneratedDay { day: number; kind: DayKind; exerciseIds: string[] }

type Candidate = Pick<Exercise, "id" | "focus" | "goals" | "muscle_groups">;
export type AssignedExercise = Candidate & { day: number };
type Rule = (e: Candidate) => boolean;

const has = (e: Candidate, ...groups: string[]) => groups.some(g => e.muscle_groups.includes(g as never));
const strong: Rule = e => e.goals.includes("Strength");
const bigPush: Rule = e => e.focus === "Push" && (has(e, "Chest") || (has(e, "Shoulders") && has(e, "Triceps")));
const bigPull: Rule = e => e.focus === "Pull" && has(e, "Lats", "Upper back");
// Hip-dominant leg work (hip thrusts, abductors) counts as glutes rather than legs.
const glutes: Rule = e => e.focus === "Legs" && !has(e, "Quads") && has(e, "Glutes", "Abductors");
const isCardio: Rule = e => e.focus === "Cardio";

// One full-body strength day, in order. A slot with several pools draws from one of them at random.
export const fullBodySlots: { label: string; pools: Rule[] }[] = [
  { label: "Push, big muscles", pools: [bigPush] },
  { label: "Push, small muscles", pools: [e => e.focus === "Push" && !bigPush(e)] },
  { label: "Pull, big muscles", pools: [bigPull] },
  { label: "Pull, small muscles", pools: [e => e.focus === "Pull" && !bigPull(e)] },
  { label: "Legs", pools: [e => e.focus === "Legs" && !glutes(e)] },
  { label: "Glutes, core or PT", pools: [glutes, e => e.focus === "Core", e => e.focus === "PT"] },
];
const slotOf = (e: Candidate) => fullBodySlots.findIndex(slot => slot.pools.some(fits => fits(e)));
// Random picks must be tagged Strength; PT moves are welcome whatever their goal.
const randomFits = (e: Candidate, fits: Rule) => fits(e) && (strong(e) || e.focus === "PT");
const inRange = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

function extraPicks(library: Candidate[], req: PlanRequest) {
  const assignedIds = new Set(req.assignments.map(e => e.id));
  return library.filter(e => req.picks.includes(e.id) && !assignedIds.has(e.id));
}

export function assignmentConflict(assignments: AssignedExercise[], added: AssignedExercise) {
  const sameDay = assignments.filter(e => e.day === added.day);
  const day = weekdays[added.day - 1];
  if (sameDay.some(e => isCardio(e) !== isCardio(added))) {
    return `Strength and cardio are both assigned to ${day}. Choose a different day for one of them.`;
  }
  return null;
}

export function planError(library: Candidate[], req: PlanRequest): string | null {
  if (!inRange(req.strengthDays, 0, 7) || !inRange(req.enduranceDays, 0, 7) || req.strengthDays + req.enduranceDays > 7) {
    return "Choose strength and endurance days that add up to 7 or fewer.";
  }
  if (new Set(req.restDays).size !== req.restDays.length || req.restDays.some(day => !inRange(day, 1, 7))) {
    return "Choose rest days from Monday to Sunday.";
  }
  if (req.strengthDays + req.enduranceDays + req.restDays.length > 7) {
    return `With ${req.restDays.length} rest days you have ${7 - req.restDays.length} days left for strength and endurance. Lower the day counts or free up a rest day.`;
  }
  const assignedRest = req.assignments.find(e => req.restDays.includes(e.day));
  if (assignedRest) {
    return `${weekdays[assignedRest.day - 1]} has an assigned exercise. Remove the assignment or train that day.`;
  }
  const ids = new Set(library.map(e => e.id));
  if (new Set(req.picks).size !== req.picks.length || req.picks.some(id => !ids.has(id))) return "Choose exercises from your library.";
  if (req.source === "picks" && req.strengthDays + req.enduranceDays > 0 && !req.picks.length && !req.assignments.length) {
    return "Choose at least one exercise to include.";
  }
  for (const exercise of req.assignments) {
    const conflict = assignmentConflict(req.assignments, exercise);
    if (conflict) return conflict;
  }
  const strength = new Set(req.assignments.filter(e => !isCardio(e)).map(e => e.day)).size;
  const endurance = new Set(req.assignments.filter(isCardio).map(e => e.day)).size;
  if (strength > req.strengthDays || endurance > req.enduranceDays) {
    return `Your assigned exercises need at least ${strength} strength and ${endurance} endurance days. Increase the day counts or remove an assignment.`;
  }
  const picked = [...req.assignments, ...extraPicks(library, req)];
  if (picked.some(isCardio) && !req.enduranceDays) return "Add an endurance day for the cardio exercises you chose.";
  if (picked.some(e => !isCardio(e)) && !req.strengthDays) return "Add a strength day for the strength exercises you chose.";
  return null;
}

// All 128 possible sets of strength weekdays, including the empty week.
const strengthLayouts = weekdays.reduce<number[][]>((layouts, _, i) =>
  layouts.concat(layouts.map(days => [...days, i + 1])), [[]]);

// Smaller sums favour evenly spaced days, including the gap from Sunday into the next week.
function spacingCost(days: number[]) {
  return days.reduce((sum, day, i) => sum + ((days[i + 1] ?? days[0] + 7) - day) ** 2, 0);
}

export function generateWeek(library: Candidate[], req: PlanRequest, random = Math.random): GeneratedDay[] {
  const randomInt = (n: number) => Math.floor(random() * n);
  const shuffle = <T>(items: T[]) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) { const j = randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  };

  const layouts = strengthLayouts.filter(days => days.length === req.strengthDays &&
    !days.some(day => req.restDays.includes(day)) && req.assignments.every(e => days.includes(e.day) === !isCardio(e)));
  const bestCost = Math.min(...layouts.map(spacingCost));
  const best = layouts.filter(days => spacingCost(days) === bestCost);
  const strengthDays = best[randomInt(best.length)];
  const cardioDays = new Set(req.assignments.filter(isCardio).map(e => e.day));
  const kinds: DayKind[] = weekdays.map((_, i) => strengthDays.includes(i + 1) ? "Strength" : cardioDays.has(i + 1) ? "Endurance" : "Rest");
  const open = kinds.flatMap((kind, i) => kind === "Rest" && !req.restDays.includes(i + 1) ? [i] : []);
  for (const i of shuffle(open).slice(0, req.enduranceDays - cardioDays.size)) kinds[i] = "Endurance";

  const uses = new Map<string, number>();
  const use = (e: Candidate) => { uses.set(e.id, (uses.get(e.id) ?? 0) + 1); return e.id; };
  const leastUsed = (candidates: Candidate[]) => {
    const fewest = Math.min(...candidates.map(e => uses.get(e.id) ?? 0));
    const options = candidates.filter(e => (uses.get(e.id) ?? 0) === fewest);
    return options[randomInt(options.length)];
  };

  // Manual choices can share a slot. Random fill draws once for each empty slot.
  const strength = strengthDays.map(day => ({ day, slots: fullBodySlots.map((): string[] => []) }));
  const endurance = kinds.flatMap((kind, i) => kind === "Endurance" ? [{ day: i + 1, ids: [] as string[] }] : []);

  for (const exercise of req.assignments) {
    if (isCardio(exercise)) endurance.find(d => d.day === exercise.day)!.ids.push(use(exercise));
    else strength.find(d => d.day === exercise.day)!.slots[slotOf(exercise)].push(use(exercise));
  }
  const picked = extraPicks(library, req);
  for (const e of shuffle(picked.filter(e => !isCardio(e)))) {
    const slot = slotOf(e);
    const day = shuffle(strength).reduce((a, b) => a.slots[slot].length <= b.slots[slot].length ? a : b);
    day.slots[slot].push(use(e));
  }
  for (const e of shuffle(picked.filter(isCardio))) {
    const day = endurance.reduce((a, b) => a.ids.length <= b.ids.length ? a : b);
    day.ids.push(use(e));
  }

  if (req.source !== "picks") {
    for (const day of strength) {
      fullBodySlots.forEach((slot, i) => {
        if (day.slots[i].length) return;
        const pools = shuffle(slot.pools.map(fits => library.filter(e => randomFits(e, fits))))
          .filter(pool => pool.length);
        if (pools.length) day.slots[i].push(use(leastUsed(pools[0])));
      });
    }
    const cardio = library.filter(isCardio);
    for (const day of endurance) if (!day.ids.length && cardio.length) day.ids.push(use(leastUsed(cardio)));
  }

  return kinds.map((kind, i) => ({
    day: i + 1,
    kind,
    exerciseIds: kind === "Strength" ? strength.find(d => d.day === i + 1)!.slots.flat()
      : kind === "Endurance" ? endurance.find(d => d.day === i + 1)!.ids : [],
  }));
}
