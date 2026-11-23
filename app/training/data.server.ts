import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { redirect } from "react-router";
import pool from "../db.server";
import { getUserId } from "../session.server";
import {
  addDays, dayOfWeek, exerciseUnits, isoDate, maxLoggedSets, movementFocuses, muscleGroups, trainingGoals, trainingPath,
  weekdays, weekStart,
} from "./model";
import { exerciseSources, generateWeek, pinConflict, planError, type DayKind, type PinnedExercise } from "./generator";
import type { Exercise, PlannedExercise, RecordedMovement, TrainingFocus } from "./model";

export async function requireTrainingUser(request: Request) {
  const userId = await getUserId(request);
  if (userId === null) {
    const next = new URL(request.url).pathname.replace(/\.data$/, "");
    throw redirect(trainingPath + "/sign-in?next=" + encodeURIComponent(next));
  }
  return userId;
}

export async function listExercises(userId: number | null, db: Pick<PoolClient, "query"> = pool) {
  const { rows } = await db.query<Exercise>(
    `SELECT id, name, focus, muscle_groups, goals, unit, author_name
     FROM training_exercises WHERE author_id = $1 ORDER BY name, id`, [userId]);
  return rows;
}

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const integer = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;

function selectedOptions<T extends string>(form: FormData, key: string, options: readonly T[]): T[] | null {
  const submitted = new Set(form.getAll(key));
  const selected = options.filter(option => submitted.has(option));
  return selected.length > 0 && selected.length === submitted.size ? selected : null;
}

function readFocus(form: FormData): TrainingFocus | null {
  const focus = movementFocuses.find(option => option === value(form, "focus"));
  const goals = selectedOptions(form, "goals", trainingGoals);
  const groups = selectedOptions(form, "muscle_groups", muscleGroups);
  if (!focus || !goals || !groups) return null;
  return { focus, goals, muscle_groups: groups };
}

const focusError = "Choose a movement focus, at least one training goal and at least one muscle group.";

export async function createExercise(userId: number, form: FormData) {
  const tags = readFocus(form);
  if (!tags) return focusError;
  const name = value(form, "name"), unit = value(form, "unit");
  if (!name || name.length > 80 || !exerciseUnits.some(option => option === unit)) {
    return "Check the exercise name and tracking unit.";
  }

  // Pin the creator from the session and snapshot their display name in the same write.
  await pool.query(`INSERT INTO training_exercises (id, author_id, author_name, name, focus, muscle_groups, goals, unit)
    SELECT $1, u.id, COALESCE(NULLIF(btrim(u.name), ''), 'Member ' || u.id), $3, $4, $5, $6, $7
    FROM users u WHERE u.id = $2`,
    [randomUUID(), userId, name, tags.focus, tags.muscle_groups, tags.goals, unit]);
}

const isDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= "0001-01-01" &&
  Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

export function readPlannedDate(date: string) {
  if (!isDate(date)) throw new Response("Workout not found", { status: 404, statusText: "Workout not found" });
  return date;
}

export async function recordSession(userId: number, plannedOn: string, form: FormData) {
  const day = await getLockedDay(userId, plannedOn);
  const date = value(form, "date"), notes = value(form, "notes"), token = value(form, "submission");
  if (!isDate(date)) return "Enter a valid training date.";
  if (notes.length > 1000 || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(token)) return "Check your notes and reload the form if needed.";
  const recorded: RecordedMovement[] = [];
  for (const move of day.exercises) {
    const sets: RecordedMovement["sets"] = [];
    for (let i = 1; i <= maxLoggedSets; i++) {
      const key = move.position + "-" + i;
      const amount = value(form, "quantity-" + key), load = value(form, "weight-" + key);
      if (!amount && !load) continue;
      const quantity = Number(amount), weight = load ? Number(load) : null;
      if (!integer(quantity, 3600) || (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 5000))) {
        return "Check the amount and optional weight for " + move.name + ", set " + i + ".";
      }
      sets.push({ quantity, weight });
    }
    // Sets are keyed by position, so make sure each position still holds the exercise that was on screen.
    if (sets.length && value(form, "exercise-" + move.position) !== move.id) {
      return "This workout changed while you were logging. Check your sets and save again.";
    }
    if (sets.length) recorded.push({ name: move.name, author_name: move.author_name, unit: move.unit, sets });
  }
  if (!recorded.length) return "Enter at least one completed set.";
  await pool.query(`INSERT INTO training_sessions (user_id, submission_id, workout_name, performed_on, notes, movements)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, submission_id) DO NOTHING`,
    [userId, token, workoutName(day), date, notes, JSON.stringify(recorded)]);
}

export async function listSessions(userId: number) {
  const { rows } = await pool.query<{ id: string; name: string; date: string; notes: string; movements: RecordedMovement[] }>(
    `SELECT id, workout_name AS name, to_char(performed_on, 'YYYY-MM-DD') AS date, notes, movements
     FROM training_sessions WHERE user_id = $1 ORDER BY performed_on DESC, id DESC`, [userId]);
  return rows;
}

export async function listWeeklyPlan(userId: number, db: Pick<PoolClient, "query"> = pool) {
  const { rows } = await db.query<{ day_of_week: number; exercise_id: string; name: string; author_name: string; pinned: boolean; focus: Exercise["focus"] }>(
    `SELECT p.day_of_week, p.exercise_id, e.name, e.author_name, e.focus, p.pinned
     FROM training_weekly_plan p
     JOIN training_exercises e ON e.author_id = p.user_id AND e.id = p.exercise_id
     WHERE p.user_id = $1 ORDER BY p.day_of_week, p.position, e.name, e.id`, [userId]);
  return rows;
}

async function pinnedExercises(client: PoolClient, userId: number) {
  const { rows } = await client.query<PinnedExercise>(
    `SELECT p.day_of_week AS day, e.id, e.focus, e.goals, e.muscle_groups FROM training_weekly_plan p
     JOIN training_exercises e ON e.author_id = p.user_id AND e.id = p.exercise_id
     WHERE p.user_id = $1 AND p.pinned ORDER BY p.day_of_week, p.position, e.id`, [userId]);
  return rows;
}

// Serialize edits and regeneration so a pin saved while a week is being filled survives either order.
async function editWeek(userId: number, edit: (client: PoolClient) => Promise<string | void>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE", [userId]);
    const error = await edit(client);
    await client.query(error ? "ROLLBACK" : "COMMIT");
    return error;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateWeeklyPlan(userId: number, form: FormData) {
  const day = Number(value(form, "day"));
  const exercise = value(form, "exercise");
  if (!integer(day, 7) || !exercise) return "Choose a weekday and an exercise.";
  return editWeek(userId, async client => {
    const intent = value(form, "intent");
    if (intent === "remove") {
      await client.query("DELETE FROM training_weekly_plan WHERE user_id = $1 AND day_of_week = $2 AND exercise_id = $3",
        [userId, day, exercise]);
      return;
    }
    if (intent !== "add") return "Choose a plan action.";
    const { rows: [candidate] } = await client.query<PinnedExercise>(
      "SELECT $3::int AS day, id, focus, goals, muscle_groups FROM training_exercises WHERE author_id = $1 AND id = $2",
      [userId, exercise, day]);
    if (!candidate) return "Choose an exercise from your library.";
    const pins = await pinnedExercises(client, userId);
    const conflict = pinConflict(pins, candidate);
    if (conflict) return conflict;
    const result = await client.query(
      `INSERT INTO training_weekly_plan (user_id, day_of_week, exercise_id, position, pinned)
       SELECT $1, $2, $3, COALESCE(MAX(position), 0) + 1, true FROM training_weekly_plan
       WHERE user_id = $1 AND day_of_week = $2
       ON CONFLICT (user_id, day_of_week, exercise_id) DO UPDATE SET pinned = true WHERE NOT training_weekly_plan.pinned`,
      [userId, day, exercise]);
    if (!result.rowCount) return "That exercise is already pinned to this day.";
  });
}

// Trades everything on two weekdays, pins and day types included. Rows are rewritten rather than
// updated in place because both days can hold the same exercise, which would collide mid-update.
// (A writable CTE doesn't help: its DELETE and INSERT share one snapshot.)
export async function swapWeeklyDays(userId: number, form: FormData) {
  const a = Number(value(form, "day")), b = Number(value(form, "with"));
  if (!integer(a, 7) || !integer(b, 7) || a === b) return "Choose two different weekdays to swap.";
  const other = (day: number) => day === a ? b : a;
  return editWeek(userId, async client => {
    const days = [userId, a, b];
    const { rows: entries } = await client.query<{ day_of_week: number; exercise_id: string; position: number; pinned: boolean }>(
      "SELECT day_of_week, exercise_id, position, pinned FROM training_weekly_plan WHERE user_id = $1 AND day_of_week IN ($2, $3)", days);
    const { rows: kinds } = await client.query<{ day_of_week: number; kind: DayKind }>(
      "SELECT day_of_week, kind FROM training_weekly_days WHERE user_id = $1 AND day_of_week IN ($2, $3)", days);
    await client.query("DELETE FROM training_weekly_plan WHERE user_id = $1 AND day_of_week IN ($2, $3)", days);
    await client.query("DELETE FROM training_weekly_days WHERE user_id = $1 AND day_of_week IN ($2, $3)", days);
    await client.query(`INSERT INTO training_weekly_plan (user_id, day_of_week, exercise_id, position, pinned)
      SELECT $1, d, e, p, pin FROM unnest($2::smallint[], $3::text[], $4::smallint[], $5::boolean[]) AS t(d, e, p, pin)`,
      [userId, entries.map(e => other(e.day_of_week)), entries.map(e => e.exercise_id), entries.map(e => e.position), entries.map(e => e.pinned)]);
    await client.query(`INSERT INTO training_weekly_days (user_id, day_of_week, kind)
      SELECT $1, d, k FROM unnest($2::smallint[], $3::text[]) AS t(d, k)`,
      [userId, kinds.map(k => other(k.day_of_week)), kinds.map(k => k.kind)]);
  });
}

export async function listWeeklyDays(userId: number) {
  const { rows } = await pool.query<{ day_of_week: number; kind: DayKind }>(
    "SELECT day_of_week, kind FROM training_weekly_days WHERE user_id = $1 ORDER BY day_of_week", [userId]);
  return rows;
}

// Replaces the whole week: day types and planned exercises are written together.
export async function generateWeeklyPlan(userId: number, form: FormData) {
  const source = exerciseSources.find(option => option === value(form, "source"));
  if (!source) return "Choose where exercises come from.";
  return editWeek(userId, async client => {
    const request = {
      strengthDays: Number(value(form, "strength_days")),
      enduranceDays: Number(value(form, "endurance_days")),
      source,
      picks: source === "random" ? [] : form.getAll("pick").map(String),
      restDays: form.getAll("rest_day").map(Number),
      pins: await pinnedExercises(client, userId),
    };
    const library = await listExercises(userId, client);
    const error = planError(library, request);
    if (error) return error;
    const week = generateWeek(library, request);
    const entries = week.flatMap(d => d.exerciseIds.map((id, position) => ({ day: d.day, id, position })));
    await client.query("DELETE FROM training_weekly_plan WHERE user_id = $1 AND NOT pinned", [userId]);
    await client.query("DELETE FROM training_weekly_days WHERE user_id = $1", [userId]);
    await client.query(`INSERT INTO training_weekly_days (user_id, day_of_week, kind)
      SELECT $1, day, kind FROM unnest($2::smallint[], $3::text[]) AS d(day, kind)`,
      [userId, week.map(d => d.day), week.map(d => d.kind)]);
    await client.query(`INSERT INTO training_weekly_plan (user_id, day_of_week, exercise_id, position)
      SELECT $1, day, id, position FROM unnest($2::smallint[], $3::text[], $4::smallint[]) AS p(day, id, position)
      ON CONFLICT (user_id, day_of_week, exercise_id) DO UPDATE SET position = EXCLUDED.position`,
      [userId, entries.map(e => e.day), entries.map(e => e.id), entries.map(e => e.position)]);
  });
}

export interface LockedDay { date: string; kind: DayKind; exercises: PlannedExercise[] }

export function workoutName(day: LockedDay) {
  const weekday = weekdays[dayOfWeek(day.date) - 1];
  return weekday + " " + (day.kind === "Rest" ? "workout" : day.kind.toLowerCase());
}

// Locked days between two dates, inclusive, each with its exercises in order.
export async function listLockedDays(userId: number, from: string, to: string): Promise<LockedDay[]> {
  const [{ rows: days }, { rows: exercises }] = await Promise.all([
    pool.query<{ date: string; kind: DayKind }>(
      `SELECT to_char(planned_on, 'YYYY-MM-DD') AS date, kind FROM training_locked_days
       WHERE user_id = $1 AND planned_on BETWEEN $2 AND $3 ORDER BY planned_on`, [userId, from, to]),
    pool.query<PlannedExercise & { date: string }>(
      `SELECT to_char(l.planned_on, 'YYYY-MM-DD') AS date, l.position, e.id, e.name, e.focus, e.goals,
         e.muscle_groups, e.unit, e.author_name
       FROM training_locked_exercises l
       JOIN training_exercises e ON e.author_id = l.user_id AND e.id = l.exercise_id
       WHERE l.user_id = $1 AND l.planned_on BETWEEN $2 AND $3 ORDER BY l.planned_on, l.position`, [userId, from, to]),
  ]);
  return days.map(day => ({ ...day, exercises: exercises.filter(e => e.date === day.date).map(({ date: _, ...e }) => e) }));
}

export async function getLockedDay(userId: number, date: string) {
  const [day] = await listLockedDays(userId, readPlannedDate(date), date);
  if (!day) throw new Response("Workout not found", { status: 404, statusText: "Workout not found" });
  return day;
}

// Dates a week around the server's day, wide enough to hold the browser's current week in any time zone.
export function lockWindow() {
  const today = isoDate(new Date());
  return { today, from: addDays(today, -8), to: addDays(today, 8) };
}

// Copies the repeating plan onto the dated Monday–Sunday that contains the browser's today.
export async function lockWeek(userId: number, form: FormData) {
  const today = value(form, "today");
  const { today: serverToday } = lockWindow();
  if (!isDate(today) || today < addDays(serverToday, -1) || today > addDays(serverToday, 1)) {
    return "Reload the page and try again.";
  }
  const start = weekStart(today);
  return editWeek(userId, async client => {
    const entries = await listWeeklyPlan(userId, client);
    if (!entries.length) return "Plan at least one exercise before locking in the week.";
    const { rows: kinds } = await client.query<{ day_of_week: number; kind: DayKind }>(
      "SELECT day_of_week, kind FROM training_weekly_days WHERE user_id = $1", [userId]);
    const days = weekdays.map((_, i) => {
      const planned = entries.filter(e => e.day_of_week === i + 1);
      const kind: DayKind = !planned.length ? kinds.find(k => k.day_of_week === i + 1)?.kind ?? "Rest"
        : planned.every(e => e.focus === "Cardio") ? "Endurance" : "Strength";
      return { date: addDays(start, i), kind, ids: planned.map(e => e.exercise_id) };
    });
    const rows = days.flatMap(d => d.ids.map((id, i) => ({ date: d.date, id, position: i + 1 })));
    await client.query("DELETE FROM training_locked_days WHERE user_id = $1 AND planned_on BETWEEN $2 AND $3",
      [userId, start, addDays(start, 6)]);
    await client.query(`INSERT INTO training_locked_days (user_id, planned_on, kind)
      SELECT $1, d, k FROM unnest($2::date[], $3::text[]) AS t(d, k)`,
      [userId, days.map(d => d.date), days.map(d => d.kind)]);
    await client.query(`INSERT INTO training_locked_exercises (user_id, planned_on, position, exercise_id)
      SELECT $1, d, p, e FROM unnest($2::date[], $3::smallint[], $4::text[]) AS t(d, p, e)`,
      [userId, rows.map(r => r.date), rows.map(r => r.position), rows.map(r => r.id)]);
  });
}

// Live changes to one locked day from the training log. The repeating weekly plan is left alone.
export async function editLockedDay(userId: number, date: string, form: FormData) {
  readPlannedDate(date);
  const intent = value(form, "intent"), exercise = value(form, "exercise");
  const position = Number(value(form, "position"));
  if (!["swap", "add", "remove"].includes(intent)) return "Choose a workout change.";
  if (intent !== "add" && !integer(position, 32767)) return "Choose an exercise on this workout.";
  return editWeek(userId, async client => {
    const { rows: current } = await client.query<{ position: number; exercise_id: string }>(
      `SELECT l.position, l.exercise_id FROM training_locked_days d
       LEFT JOIN training_locked_exercises l USING (user_id, planned_on)
       WHERE d.user_id = $1 AND d.planned_on = $2`, [userId, date]);
    if (!current.length) return "This day isn't part of a locked-in week.";
    if (intent === "remove") {
      await client.query("DELETE FROM training_locked_exercises WHERE user_id = $1 AND planned_on = $2 AND position = $3",
        [userId, date, position]);
      return;
    }
    const owned = await client.query("SELECT 1 FROM training_exercises WHERE author_id = $1 AND id = $2", [userId, exercise]);
    if (!owned.rowCount) return "Choose an exercise from your library.";
    if (current.some(e => e.exercise_id === exercise && e.position !== position)) return "That exercise is already in this workout.";
    if (intent === "add") {
      await client.query(`INSERT INTO training_locked_exercises (user_id, planned_on, position, exercise_id)
        SELECT $1, $2, COALESCE(MAX(position), 0) + 1, $3 FROM training_locked_exercises
        WHERE user_id = $1 AND planned_on = $2`, [userId, date, exercise]);
      return;
    }
    const swapped = await client.query(
      "UPDATE training_locked_exercises SET exercise_id = $4 WHERE user_id = $1 AND planned_on = $2 AND position = $3",
      [userId, date, position, exercise]);
    if (!swapped.rowCount) return "Choose an exercise on this workout.";
  });
}
