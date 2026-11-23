import { randomUUID } from "node:crypto";
import { redirect } from "react-router";
import pool from "../db.server";
import { getUserId } from "../session.server";
import { equipmentOptions, maxLoggedSets, movementFocuses, muscleGroups, trainingGoals, trainingPath } from "./model";
import type { Exercise, Movement, RecordedMovement, TrainingFocus, Workout } from "./model";

export async function requireTrainingUser(request: Request) {
  const userId = await getUserId(request);
  if (userId === null) {
    const next = new URL(request.url).pathname.replace(/\.data$/, "");
    throw redirect(trainingPath + "/sign-in?next=" + encodeURIComponent(next));
  }
  return userId;
}

export async function listExercises(userId: number | null) {
  const { rows } = await pool.query<Exercise>(
    `SELECT id, name, focus, muscle_groups, goal, equipment, unit, cue, author_name
     FROM training_exercises WHERE author_id = $1 ORDER BY name, id`, [userId]);
  return rows;
}

export async function listWorkouts(userId: number | null) {
  const { rows } = await pool.query<Workout & { count: number }>(
    `SELECT w.id, w.name, w.focus, w.muscle_groups, w.goal, w.description, w.minutes,
       COUNT(m.position)::int AS count
     FROM training_workouts w JOIN training_workout_exercises m ON m.workout_id = w.id
     WHERE w.owner_id = $1 GROUP BY w.id ORDER BY w.name, w.id`, [userId]);
  return rows;
}

export async function getWorkout(id: string, userId: number | null) {
  const { rows: [workout] } = await pool.query<Workout>(
    `SELECT id, name, focus, muscle_groups, goal, description, minutes
     FROM training_workouts WHERE id = $1 AND owner_id = $2`, [id, userId]);
  if (!workout) throw new Response("Workout not found", { status: 404, statusText: "Workout not found" });
  const { rows: movements } = await pool.query<Movement>(
    `SELECT e.id, e.name, e.focus, e.muscle_groups, e.goal, e.equipment, e.unit, e.cue, e.author_name,
       m.position, m.sets, m.target
     FROM training_workout_exercises m JOIN training_exercises e ON e.id = m.exercise_id
     WHERE m.workout_id = $1 AND e.author_id = $2 ORDER BY m.position`, [id, userId]);
  return { workout, movements };
}

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const integer = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;
function readFocus(form: FormData): TrainingFocus | null {
  const focus = movementFocuses.find(option => option === value(form, "focus"));
  const goal = trainingGoals.find(option => option === value(form, "goal"));
  const selected = new Set(form.getAll("muscle_groups"));
  const groups = muscleGroups.filter(group => selected.has(group));
  if (!focus || !goal || !groups.length || groups.length !== selected.size) return null;
  return { focus, goal, muscle_groups: groups };
}

const focusError = "Choose a movement focus, a training goal and at least one muscle group.";

export async function createExercise(userId: number, form: FormData) {
  const tags = readFocus(form);
  if (!tags) return focusError;
  const name = value(form, "name"), unit = value(form, "unit");
  const equipment = value(form, "equipment"), cue = value(form, "cue");
  if (!name || name.length > 80 || !equipmentOptions.includes(equipment) ||
      !["reps", "seconds"].includes(unit) || cue.length > 500) return "Check the exercise name, equipment, tracking unit and cues.";

  // Pin the creator from the session and snapshot their display name in the same write.
  await pool.query(`INSERT INTO training_exercises (id, author_id, author_name, name, focus, muscle_groups, goal, equipment, unit, cue)
    SELECT $1, u.id, COALESCE(NULLIF(btrim(u.name), ''), 'Member ' || u.id), $3, $4, $5, $6, $7, $8, $9
    FROM users u WHERE u.id = $2`,
    [randomUUID(), userId, name, tags.focus, tags.muscle_groups, tags.goal, equipment, unit, cue]);
}

export async function createWorkout(userId: number, form: FormData) {
  const tags = readFocus(form);
  if (!tags) return { error: focusError };
  const name = value(form, "name"), minutes = Number(value(form, "minutes"));
  const description = value(form, "description");
  const ids = form.getAll("exercise").map(String);
  const sets = form.getAll("sets").map(Number);
  const targets = form.getAll("target").map(Number);
  if (!name || name.length > 80 || !integer(minutes, 600) || description.length > 500) {
    return { error: "Enter a workout name and duration from 1 to 600 minutes." };
  }
  if (!ids.length || ids.length > 12 || sets.length !== ids.length || targets.length !== ids.length ||
      sets.some(n => !integer(n, 8)) || targets.some(n => !integer(n, 3600))) {
    return { error: "Choose up to 12 exercises with 1–8 sets and a target for each." };
  }
  const client = await pool.connect();
  const id = randomUUID();
  try {
    await client.query("BEGIN");
    const allowed = await client.query(
      "SELECT id FROM training_exercises WHERE id = ANY($1) AND author_id = $2 FOR SHARE",
      [ids, userId]);
    if (allowed.rowCount !== new Set(ids).size) {
      await client.query("ROLLBACK");
      return { error: "Choose exercises from your library." };
    }
    await client.query(`INSERT INTO training_workouts (id, owner_id, name, focus, muscle_groups, goal, minutes, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [id, userId, name, tags.focus, tags.muscle_groups, tags.goal, minutes, description]);
    await client.query(`INSERT INTO training_workout_exercises (workout_id, position, exercise_id, sets, target)
      SELECT $1, position, exercise, sets, target FROM unnest($2::text[], $3::int[], $4::int[])
      WITH ORDINALITY AS entry(exercise, sets, target, position)`, [id, ids, sets, targets]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return { id };
}

export async function recordSession(userId: number, id: string, form: FormData) {
  const { workout, movements } = await getWorkout(id, userId);
  const date = value(form, "date"), notes = value(form, "notes"), token = value(form, "submission");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < "0001-01-01" ||
      !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return "Enter a valid training date.";
  if (notes.length > 1000 || !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(token)) return "Check your notes and reload the form if needed.";
  const recorded: RecordedMovement[] = [];
  for (const move of movements) {
    const sets: RecordedMovement["sets"] = [];
    for (let i = 1; i <= maxLoggedSets; i++) {
      const key = move.position + "-" + i;
      const amount = value(form, "quantity-" + key), load = value(form, "weight-" + key);
      if (!amount && !load) continue;
      const quantity = Number(amount), weight = load ? Number(load) : null;
      if (!integer(quantity, 3600) || (weight !== null && (!Number.isFinite(weight) || weight < 0 || weight > 5000))) {
        return "Check the reps or seconds and optional weight for " + move.name + ", set " + i + ".";
      }
      sets.push({ quantity, weight });
    }
    if (sets.length) recorded.push({ name: move.name, author_name: move.author_name, unit: move.unit, sets });
  }
  if (!recorded.length) return "Enter at least one completed set.";
  await pool.query(`INSERT INTO training_sessions (user_id, submission_id, workout_name, performed_on, notes, movements)
    VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (user_id, submission_id) DO NOTHING`,
    [userId, token, workout.name, date, notes, JSON.stringify(recorded)]);
}

export async function listSessions(userId: number) {
  const { rows } = await pool.query<{ id: string; name: string; date: string; notes: string; movements: RecordedMovement[] }>(
    `SELECT id, workout_name AS name, to_char(performed_on, 'YYYY-MM-DD') AS date, notes, movements
     FROM training_sessions WHERE user_id = $1 ORDER BY performed_on DESC, id DESC`, [userId]);
  return rows;
}

export async function listWeeklyPlan(userId: number) {
  const { rows } = await pool.query<{ day_of_week: number; exercise_id: string; name: string; author_name: string }>(
    `SELECT p.day_of_week, p.exercise_id, e.name, e.author_name
     FROM training_weekly_plan p
     JOIN training_exercises e ON e.author_id = p.user_id AND e.id = p.exercise_id
     WHERE p.user_id = $1 ORDER BY p.day_of_week, e.name, e.id`, [userId]);
  return rows;
}

export async function updateWeeklyPlan(userId: number, form: FormData) {
  const day = Number(value(form, "day"));
  const exercise = value(form, "exercise");
  if (!integer(day, 7) || !exercise) return "Choose a weekday and an exercise.";
  switch (value(form, "intent")) {
    case "add": {
      const result = await pool.query(
        `INSERT INTO training_weekly_plan (user_id, day_of_week, exercise_id)
         SELECT author_id, $2, id FROM training_exercises WHERE author_id = $1 AND id = $3
         ON CONFLICT (user_id, day_of_week, exercise_id) DO NOTHING`, [userId, day, exercise]);
      if (!result.rowCount) return "Choose an exercise from your library that is not already on that day.";
      break;
    }
    case "remove":
      await pool.query("DELETE FROM training_weekly_plan WHERE user_id = $1 AND day_of_week = $2 AND exercise_id = $3",
        [userId, day, exercise]);
      break;
    default:
      return "Choose a plan action.";
  }
}
