import type { Exercise } from "./model";

export const dayKinds = ["Strength", "Endurance", "Rest"] as const;
export type DayKind = (typeof dayKinds)[number];
export const exerciseSources = ["random", "picks", "mix"] as const;
export type ExerciseSource = (typeof exerciseSources)[number];

export interface PlanRequest {
  strengthDays: number;
  enduranceDays: number;
  source: ExerciseSource;
  picks: string[];
}
export interface GeneratedDay { day: number; kind: DayKind; exerciseIds: string[] }

type Candidate = Pick<Exercise, "id" | "focus" | "goals" | "muscle_groups">;
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

export function planError(library: Candidate[], req: PlanRequest): string | null {
  if (!inRange(req.strengthDays, 0, 7) || !inRange(req.enduranceDays, 0, 7) || req.strengthDays + req.enduranceDays > 7) {
    return "Choose strength and endurance days that add up to 7 or fewer.";
  }
  const ids = new Set(library.map(e => e.id));
  if (new Set(req.picks).size !== req.picks.length || req.picks.some(id => !ids.has(id))) return "Choose exercises from your library.";
  if (req.source === "picks" && !req.picks.length) return "Choose at least one exercise to include.";
  const picked = library.filter(e => req.picks.includes(e.id));
  if (picked.some(isCardio) && !req.enduranceDays) return "Add an endurance day for the cardio exercises you chose.";
  for (const [i, slot] of fullBodySlots.entries()) {
    const count = picked.filter(e => !isCardio(e) && slotOf(e) === i).length;
    if (count > req.strengthDays) {
      return `You chose ${count} “${slot.label}” exercises but each strength day has one of those slots. ` +
        `Choose at most ${req.strengthDays} or add strength days.`;
    }
  }
  return null;
}

export function generateWeek(library: Candidate[], req: PlanRequest, random = Math.random): GeneratedDay[] {
  const randomInt = (n: number) => Math.floor(random() * n);
  const shuffle = <T>(items: T[]) => {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) { const j = randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  };

  // Space strength days evenly from a random start, then scatter endurance and rest days over the gaps.
  const kinds: DayKind[] = Array(7).fill("Rest");
  const offset = randomInt(7);
  for (let i = 0; i < req.strengthDays; i++) kinds[(offset + Math.floor(i * 7 / req.strengthDays)) % 7] = "Strength";
  for (const i of shuffle(kinds.flatMap((kind, i) => kind === "Rest" ? [i] : [])).slice(0, req.enduranceDays)) kinds[i] = "Endurance";

  const uses = new Map<string, number>();
  const use = (e: Candidate) => { uses.set(e.id, (uses.get(e.id) ?? 0) + 1); return e.id; };
  const leastUsed = (candidates: Candidate[]) => {
    const fewest = Math.min(...candidates.map(e => uses.get(e.id) ?? 0));
    const options = candidates.filter(e => (uses.get(e.id) ?? 0) === fewest);
    return options[randomInt(options.length)];
  };

  // Strength days hold one exercise per template slot; endurance days hold a list of cardio work.
  const strength = kinds.flatMap((kind, i) => kind === "Strength" ? [{ day: i + 1, slots: Array<string | null>(fullBodySlots.length).fill(null) }] : []);
  const endurance = kinds.flatMap((kind, i) => kind === "Endurance" ? [{ day: i + 1, ids: [] as string[] }] : []);

  // Chosen exercises go into their matching slot on a random strength day; validation guarantees room.
  const picked = req.source === "random" ? [] : library.filter(e => req.picks.includes(e.id));
  for (const e of shuffle(picked.filter(e => !isCardio(e)))) {
    const slot = slotOf(e);
    const day = shuffle(strength).find(d => d.slots[slot] === null)!;
    day.slots[slot] = use(e);
  }
  shuffle(picked.filter(isCardio)).forEach((e, i) => endurance[i % endurance.length].ids.push(use(e)));

  if (req.source !== "picks") {
    for (const day of strength) {
      fullBodySlots.forEach((slot, i) => {
        if (day.slots[i] !== null) return;
        const pools = shuffle(slot.pools.map(fits => library.filter(e => randomFits(e, fits) && !day.slots.includes(e.id))))
          .filter(pool => pool.length);
        if (pools.length) day.slots[i] = use(leastUsed(pools[0]));
      });
    }
    const cardio = library.filter(isCardio);
    for (const day of endurance) if (!day.ids.length && cardio.length) day.ids.push(use(leastUsed(cardio)));
  }

  return kinds.map((kind, i) => ({
    day: i + 1,
    kind,
    exerciseIds: kind === "Strength" ? strength.find(d => d.day === i + 1)!.slots.filter(id => id !== null)
      : kind === "Endurance" ? endurance.find(d => d.day === i + 1)!.ids : [],
  }));
}
