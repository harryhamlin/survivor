import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { redirect } from "react-router";
import pool from "../db.server";
import { getUserId } from "../session.server";
import {
  addDays, dayOfWeek, exerciseUnits, restChoice, isoDate, maxLoggedSets, movementFocuses, muscleGroups, trainingGoals, trainingPath,
  logExercise, weekdays, weekStart,
} from "./model";
import { exerciseSources, generateWeek, planError, type DayKind, type AssignedExercise } from "./generator";
import type { Exercise, LogRow, PlannedExercise, RecordedMovement, TrainingFocus } from "./model";

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

interface DaySession {
  name: string;
  date: string;
  notes: string;
  movements: RecordedMovement[];
  submission_id: string;
}

async function daySession(userId: number, date: string, db: Pick<PoolClient, "query">) {
  const { rows } = await db.query<DaySession>(
    `SELECT s.submission_id, s.workout_name AS name, to_char(s.performed_on, 'YYYY-MM-DD') AS date, s.notes, s.movements
     FROM training_session_days l JOIN training_sessions s USING (user_id, submission_id)
     WHERE l.user_id = $1 AND l.planned_on = $2`, [userId, date]);
  return rows[0];
}

function sessionRows(day: PlanDay, library: Exercise[], saved?: DaySession) {
  const planned = day.exercises.map(e => ({ ...logExercise(e), position: e.position }));
  const previous: Record<string, RecordedMovement> = {};
  if (!saved) return { rows: planned, previous };

  const rows = saved.movements.map((m, i) => {
    const matches = m.exercise_id ? [] : library.filter(e => e.name === m.name && e.author_name === m.author_name && e.unit === m.unit);
    const id = m.exercise_id ?? (matches.length === 1 ? matches[0].id : `snapshot-${i}`);
    previous[id] = m;
    return { id, name: m.name, author_name: m.author_name, unit: m.unit, cardio: m.sets.some(set => "watts" in set), position: i + 1 };
  });
  for (const row of planned) {
    if (!previous[row.id]) rows.push({ ...row, position: rows.length + 1 });
  }
  return { rows, previous };
}

export async function loadSessionForm(userId: number, date: string) {
  const [day, exercises, saved] = await Promise.all([getLockedDay(userId, date), listExercises(userId), daySession(userId, date, pool)]);
  const { rows, previous } = sessionRows(day, exercises, saved);
  return { day: { date: day.date, kind: day.kind }, exercises, rows, name: saved?.name ?? workoutName(day),
    saved: saved ? { date: saved.date, notes: saved.notes } : null,
    previous: saved ? previous : await lastLoggedMovements(userId, day) };
}

function readRecordedSets(rows: LogRow[], form: FormData, previous: Record<string, RecordedMovement>) {
  const recorded: RecordedMovement[] = [];
  for (const move of rows) {
    const sets: RecordedMovement["sets"] = [];
    const cardio = move.cardio;
    for (let i = 1; i <= maxLoggedSets; i++) {
      const key = move.position + "-" + i;
      if (cardio) {
        const time = value(form, "time-" + key), power = value(form, "watts-" + key);
        if (value(form, "quantity-" + key) || value(form, "weight-" + key)) return "Reload the workout to log cardio with time and watts.";
        if (!time && !power) continue;
        const quantity = Number(time), watts = power ? Number(power) : null;
        if (!Number.isFinite(quantity) || quantity <= 0 || (watts !== null && (!Number.isFinite(watts) || watts < 0))) {
          return "Enter a positive time and optional nonnegative watts for " + move.name + ", set " + i + ".";
        }
        sets.push({ quantity, watts });
        continue;
      }
      const amount = value(form, "quantity-" + key), load = value(form, "weight-" + key);
      if (!amount && !load) continue;
      const quantity = Number(amount), weight = load ? Number(load) : null;
      if (!integer(quantity, 3600) || (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 5000))) {
        return "Check the amount and optional weight for " + move.name + ", set " + i + ".";
      }
      sets.push({ quantity, weight });
    }
    // Sets are keyed by position, so make sure each position still holds the exercise that was on screen.
    const exerciseField = "exercise-" + move.position;
    if ((sets.length || form.has(exerciseField)) && value(form, exerciseField) !== move.id) {
      return "This workout changed while you were logging. Check your sets and save again.";
    }
    if (sets.length) recorded.push({ ...(previous[move.id] ?? { exercise_id: move.id, name: move.name, author_name: move.author_name, unit: move.unit }), sets });
  }
  return recorded;
}

export async function recordSession(userId: number, plannedOn: string, form: FormData) {
  return editWeek(userId, async client => {
    const day = await getLockedDay(userId, plannedOn, client);
    const date = value(form, "date"), notes = value(form, "notes");
    if (!isDate(date)) return "Enter a valid training date.";
    if (notes.length > 1000) return "Keep session notes to 1000 characters or fewer.";
    const saved = await daySession(userId, plannedOn, client);
    // A retry of the first save may arrive after an edit. Keep the saved edit.
    if (saved && form.get("intent") === "record") return;
    if (!saved && form.get("intent") === "update") return "Reload this workout before saving.";
    const library = saved ? await listExercises(userId, client) : [];
    const layout = sessionRows(day, library, saved);
    let rows = layout.rows;
    if (saved) {
      // Updates edit the original snapshot, with optional swaps and additions from the user's library.
      const options = new Map([...library.map(logExercise), ...rows].map(e => [e.id, e]));
      const selected = new Set<string>();
      rows = [];
      for (const [field, id] of form) {
        const match = /^exercise-([1-9]\d*)$/.exec(field);
        if (!match) continue;
        const position = Number(match[1]);
        const move = options.get(String(id));
        if (!move || selected.has(move.id) || !Number.isSafeInteger(position)) return "Choose each exercise once.";
        selected.add(move.id);
        rows.push({ ...move, position });
      }
    }
    const recorded = readRecordedSets(rows, form, layout.previous);
    if (typeof recorded === "string") return recorded;
    if (!recorded.length) return "Enter at least one completed set.";
    if (saved) {
      await client.query(`UPDATE training_sessions SET performed_on = $3, notes = $4, movements = $5
        WHERE user_id = $1 AND submission_id = $2`, [userId, saved.submission_id, date, notes, JSON.stringify(recorded)]);
    } else {
      const token = randomUUID();
      await client.query(`INSERT INTO training_sessions (user_id, submission_id, workout_name, performed_on, notes, movements)
        VALUES ($1,$2,$3,$4,$5,$6)`, [userId, token, workoutName(day), date, notes, JSON.stringify(recorded)]);
      await client.query("INSERT INTO training_session_days (user_id, planned_on, submission_id) VALUES ($1,$2,$3)", [userId, plannedOn, token]);
    }
  });
}

export async function lastLoggedMovements(userId: number, day: PlanDay): Promise<Record<string, RecordedMovement>> {
  if (!day.exercises.length) return {};
  const { rows } = await pool.query<{ id: string; movement: RecordedMovement }>(
    `SELECT DISTINCT ON (e.id) e.id, m.movement
     FROM training_sessions s
     CROSS JOIN LATERAL jsonb_array_elements(s.movements) AS m(movement)
     JOIN training_exercises e ON e.author_id = s.user_id AND e.id = ANY($3::text[])
     WHERE s.user_id = $1 AND s.performed_on <= $2 AND (
       m.movement->>'exercise_id' = e.id OR (
         NOT (m.movement ? 'exercise_id') AND m.movement->>'name' = e.name
         AND m.movement->>'unit' = e.unit AND m.movement->>'author_name' = e.author_name
         AND NOT EXISTS (SELECT 1 FROM training_exercises other
           WHERE other.author_id = e.author_id AND other.name = e.name AND other.unit = e.unit
             AND other.author_name = e.author_name AND other.id <> e.id)
       )
     ) ORDER BY e.id, s.performed_on DESC, s.id DESC`, [userId, day.date, day.exercises.map(e => e.id)]);
  return Object.fromEntries(rows.map(row => [row.id, row.movement]));
}

export async function listSessions(userId: number) {
  const { rows } = await pool.query<{ id: string; name: string; date: string; notes: string; movements: RecordedMovement[]; planned_on: string | null }>(
    `SELECT s.id, s.workout_name AS name, to_char(s.performed_on, 'YYYY-MM-DD') AS date, s.notes, s.movements,
       to_char(l.planned_on, 'YYYY-MM-DD') AS planned_on
     FROM training_sessions s LEFT JOIN training_session_days l USING (user_id, submission_id)
     WHERE s.user_id = $1 ORDER BY s.performed_on DESC, s.id DESC`, [userId]);
  return rows;
}

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

export interface PlanDay {
  id: string;
  date: string;
  kind: DayKind;
  locked: boolean;
  rest_assigned: boolean;
  exercises: (PlannedExercise & { assigned: boolean })[];
}

export function workoutName(day: PlanDay) {
  const weekday = weekdays[dayOfWeek(day.date) - 1];
  return weekday + " " + (day.kind === "Rest" ? "workout" : day.kind.toLowerCase());
}

export async function listPlanDays(userId: number, from: string, to: string, lockedOnly = false, db: Pick<PoolClient, "query"> = pool) {
  const { rows } = await db.query<PlanDay>(
    `SELECT d.id, to_char(d.planned_on, 'YYYY-MM-DD') AS date, d.kind, d.locked,
       EXISTS (SELECT 1 FROM training_rest_assignments r WHERE r.day_id = d.id) AS rest_assigned,
       COALESCE(jsonb_agg(to_jsonb(e) - 'author_id' || jsonb_build_object('position', p.position, 'assigned', p.assigned)
         ORDER BY p.position) FILTER (WHERE e.id IS NOT NULL), '[]') AS exercises
     FROM training_plan_days d
     LEFT JOIN training_plan_exercises p ON p.day_id = d.id
     LEFT JOIN training_exercises e ON e.id = p.exercise_id
     WHERE d.user_id = $1 AND d.planned_on BETWEEN $2 AND $3 AND (NOT $4 OR d.locked)
     GROUP BY d.id ORDER BY d.planned_on`, [userId, from, to, lockedOnly]);
  return rows;
}

export async function getLockedDay(userId: number, date: string, db: Pick<PoolClient, "query"> = pool) {
  const [day] = await listPlanDays(userId, readPlannedDate(date), date, true, db);
  if (!day) throw new Response("Workout not found", { status: 404, statusText: "Workout not found" });
  return day;
}

export function lockWindow() {
  const today = isoDate(new Date());
  return { today, from: addDays(today, -8), to: addDays(today, 8) };
}

// Each mutation operates on the local week the user actually saw, including at UTC week boundaries.
export async function editCurrentPlan(userId: number, form: FormData) {
  const start = value(form, "week"), today = isoDate(new Date());
  if (![weekStart(addDays(today, -1)), weekStart(today), weekStart(addDays(today, 1))].includes(start)) {
    return "Reload the planner to edit the current week.";
  }
  const end = addDays(start, 6);
  const intent = value(form, "intent");
  return editWeek(userId, async client => {
    await client.query(`INSERT INTO training_plan_days (user_id, planned_on, kind)
      SELECT $1, $2::date + n, 'Rest' FROM generate_series(0,6) AS n
      WHERE NOT EXISTS (SELECT 1 FROM training_plan_days WHERE user_id = $1 AND planned_on = $2::date + n)`, [userId, start]);
    if (intent === "generate") return generateWeeklyPlan(client, userId, start, end, form);
    if (intent === "lock") {
      const planned = await client.query(`SELECT 1 FROM training_plan_days d
        WHERE d.user_id = $1 AND planned_on BETWEEN $2 AND $3 AND (
          EXISTS (SELECT 1 FROM training_plan_exercises p WHERE p.day_id = d.id) OR
          EXISTS (SELECT 1 FROM training_rest_assignments r WHERE r.day_id = d.id)
        ) LIMIT 1`, [userId, start, end]);
      if (!planned.rowCount) return "Assign an exercise or Rest before locking in the week.";
      await client.query("UPDATE training_plan_days SET locked = true WHERE user_id = $1 AND planned_on BETWEEN $2 AND $3", [userId, start, end]);
      return;
    }
    const day = Number(value(form, "day"));
    if (!integer(day, 7)) return "Choose a weekday.";
    const date = addDays(start, day - 1);
    if (intent === "swap-days") {
      const other = Number(value(form, "with"));
      if (!integer(other, 7) || other === day) return "Choose two different weekdays to swap.";
      await client.query(`UPDATE training_plan_days SET planned_on = CASE WHEN planned_on = $2 THEN $3::date ELSE $2::date END
        WHERE user_id = $1 AND planned_on IN ($2, $3)`, [userId, date, addDays(start, other - 1)]);
      return;
    }
    return editPlanExercise(client, userId, date, form, false);
  });
}

async function generateWeeklyPlan(client: PoolClient, userId: number, start: string, end: string, form: FormData) {
  const source = exerciseSources.find(option => option === value(form, "source"));
  if (!source) return "Choose where exercises come from.";
  const library = await listExercises(userId, client);
  const days = await listPlanDays(userId, start, end, false, client);
  const assignments: AssignedExercise[] = days.flatMap(d => d.exercises.filter(e => e.assigned).map(e => ({ ...e, day: dayOfWeek(d.date) })));
  const request = {
    strengthDays: Number(value(form, "strength_days")), enduranceDays: Number(value(form, "endurance_days")),
    source, picks: source === "random" ? [] : form.getAll("pick").map(String),
    restDays: days.filter(d => d.rest_assigned).map(d => dayOfWeek(d.date)), assignments,
  };
  const error = planError(library, request);
  if (error) return error;
  const week = generateWeek(library, request);
  const entries = week.flatMap(d => d.exerciseIds.map((id, i) => ({ date: addDays(start, d.day - 1), id, position: i + 1,
    assigned: assignments.some(a => a.day === d.day && a.id === id) })));
  await client.query(`DELETE FROM training_plan_exercises p USING training_plan_days d
    WHERE p.day_id = d.id AND d.user_id = $1 AND d.planned_on BETWEEN $2 AND $3`, [userId, start, end]);
  await client.query(`UPDATE training_plan_days d SET kind = t.kind FROM unnest($2::date[], $3::text[]) AS t(date,kind)
    WHERE d.user_id = $1 AND d.planned_on = t.date`, [userId, days.map(d => d.date), week.map(d => d.kind)]);
  await client.query(`INSERT INTO training_plan_exercises (user_id, day_id, exercise_id, position, assigned)
    SELECT d.user_id, d.id, t.exercise, t.position, t.assigned
    FROM unnest($2::date[], $3::text[], $4::int[], $5::boolean[]) AS t(date,exercise,position,assigned)
    JOIN training_plan_days d ON d.user_id = $1 AND d.planned_on = t.date`,
    [userId, entries.map(e => e.date), entries.map(e => e.id), entries.map(e => e.position), entries.map(e => e.assigned)]);
}

export function editLockedDay(userId: number, date: string, form: FormData) {
  readPlannedDate(date);
  return editWeek(userId, client => editPlanExercise(client, userId, date, form, true));
}

async function editPlanExercise(client: PoolClient, userId: number, date: string, form: FormData, fromLog: boolean) {
  const [day] = await listPlanDays(userId, date, date, fromLog, client);
  if (!day) return "This day isn't part of a planned week.";
  const intent = value(form, "intent"), exercise = value(form, "exercise");
  if (!(fromLog ? ["swap", "remove", "add"] : ["switch", "remove", "add"]).includes(intent)) return "Choose a workout change.";
  if (!fromLog && intent === "remove" && exercise === restChoice) {
    await client.query("DELETE FROM training_rest_assignments WHERE day_id = $1", [day.id]);
    return;
  }
  const current = fromLog ? day.exercises.find(e => e.position === Number(value(form, "position"))) : day.exercises.find(e => e.id === exercise);
  if (intent !== "add" && !current) return "Choose an exercise on this workout.";
  const replacement = intent === "switch" ? value(form, "replacement") : exercise;
  if (!fromLog && replacement === restChoice && (intent === "add" || intent === "switch")) {
    await client.query("DELETE FROM training_plan_exercises WHERE day_id = $1", [day.id]);
    await client.query("UPDATE training_plan_days SET kind = 'Rest' WHERE id = $1", [day.id]);
    await client.query("INSERT INTO training_rest_assignments (day_id) VALUES ($1) ON CONFLICT DO NOTHING", [day.id]);
    return;
  } else if (intent === "remove") {
    await client.query("DELETE FROM training_plan_exercises WHERE day_id = $1 AND position = $2", [day.id, current!.position]);
  } else {
    const owned = await client.query("SELECT 1 FROM training_exercises WHERE author_id = $1 AND id = $2", [userId, replacement]);
    if (!owned.rowCount) return "Choose an exercise from your library.";
    if (intent !== "add" && current!.id === replacement) return;
    const duplicate = day.exercises.find(e => e.id === replacement);
    if (duplicate && (intent !== "add" || fromLog || duplicate.assigned)) return "That exercise is already planned for this day.";
    if (day.rest_assigned) await client.query("DELETE FROM training_rest_assignments WHERE day_id = $1", [day.id]);
    if (intent === "add" && !duplicate) {
      await client.query(`INSERT INTO training_plan_exercises (user_id,day_id,exercise_id,position,assigned)
        VALUES ($1,$2,$3,$4,true)`, [userId, day.id, replacement, (day.exercises.at(-1)?.position ?? 0) + 1]);
    } else {
      await client.query("UPDATE training_plan_exercises SET exercise_id = $3, assigned = true WHERE day_id = $1 AND position = $2",
        [day.id, (duplicate ?? current)!.position, replacement]);
    }
  }
  await client.query(`UPDATE training_plan_days SET kind = (
    SELECT CASE WHEN count(*) = 0 THEN 'Rest' WHEN bool_and(e.focus = 'Cardio') THEN 'Endurance' ELSE 'Strength' END
    FROM training_plan_exercises p JOIN training_exercises e ON p.exercise_id = e.id WHERE p.day_id = $1
  ) WHERE id = $1`, [day.id]);
}
