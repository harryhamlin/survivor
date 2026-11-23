// Run after npm run build with a disposable local PostgreSQL database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import bcrypt from "bcryptjs";
import pg from "pg";
import { createRequestHandler } from "react-router";

const url = process.env.TRAINING_TEST_DATABASE_URL;
test("training routes share accounts, isolate private libraries and save performed sets once", {
  skip: !url && "Set TRAINING_TEST_DATABASE_URL to a disposable local database",
}, async () => {
  const db = new URL(url);
  assert.equal(db.hostname, "localhost");
  const schema = "training_test_" + randomUUID().replaceAll("-", "");
  const admin = new pg.Pool({ connectionString: url });
  db.searchParams.set("options", "-c search_path=" + schema);
  const pool = new pg.Pool({ connectionString: db.href });
  process.env.DATABASE_URL = db.href;
  process.env.SESSION_SECRET = "workout-test-only";
  const host = "https://workouts.torchsnuffers.com";
  try {
    await admin.query("CREATE SCHEMA " + schema);
    await pool.query(await readFile("db/schema.sql", "utf8"));
    const migration = await readFile("db/workouts.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration);
    assert.equal((await pool.query("SELECT id FROM training_exercises")).rowCount, 0);
    assert.equal((await pool.query("SELECT id FROM training_workouts")).rowCount, 0);
    const { rows: [creator, otherUser] } = await pool.query(
      "INSERT INTO users (email, name, password_hash) VALUES ('a@example.test', 'Alex', $1), ('b@example.test', 'Sam', $1) RETURNING id",
      [await bcrypt.hash("demo-pass", 4)],
    );
    const handle = createRequestHandler(await import("../build/server/index.js"), "production");
    const get = (path, cookie = "") => handle(new Request(host + path, { headers: { Cookie: cookie } }));
    const post = (path, form, cookie = "") => handle(new Request(host + path, {
      method: "POST", headers: { Cookie: cookie, Origin: host }, body: new URLSearchParams(form),
    }));
    assert.equal((await get("/")).headers.get("Location"), "/workouts");
    assert.equal((await handle(new Request("https://torchsnuffers.com/"))).status, 200);
    assert.match(await (await get("/workouts")).text(), /Log in to see your workout library/);
    assert.match((await get("/workouts/log")).headers.get("Location"), /sign-in/);
    const login = async email => {
      const response = await post("/workouts/sign-in?next=/workouts/log", { email, password: "demo-pass" });
      assert.equal(response.headers.get("Location"), "/workouts/log");
      return response.headers.get("set-cookie").split(";")[0];
    };
    const a = await login("a@example.test"), b = await login("b@example.test");
    assert.match(await (await get("/workouts/new", a)).text(), /Add your first exercise/);
    const lift = {
      name: "Test lift", focus: "Push", muscle_groups: "Chest", goals: "Power", unit: "reps",
      author_id: String(otherUser.id), author_name: "Forged name",
    };
    for (const invalid of [{ focus: "Upper body" }, { goals: "" }, { goals: "Unknown" }, { muscle_groups: "" }, { muscle_groups: "Unknown" }]) {
      assert.equal((await post("/workouts/exercises/new", { ...lift, ...invalid }, a)).status, 400);
    }
    const form = new URLSearchParams(lift);
    form.append("muscle_groups", "Triceps");
    form.append("goals", "Endurance");
    form.append("goals", "Power");
    const badGoals = new URLSearchParams(form);
    badGoals.append("goals", "Unknown");
    assert.equal((await post("/workouts/exercises/new", badGoals, a)).status, 400);
    assert.equal((await post("/workouts/exercises/new?next=workout", form, a)).headers.get("Location"), "/workouts/new");
    const { rows: [exercise] } = await pool.query("SELECT * FROM training_exercises WHERE name = 'Test lift'");
    assert.equal(exercise.author_id, creator.id);
    assert.equal(exercise.author_name, "Alex");
    assert.equal(exercise.focus, "Push");
    assert.deepEqual(exercise.goals, ["Power", "Endurance"]);
    for (const removed of ["goal", "equipment", "cue"]) assert.ok(!(removed in exercise));
    assert.deepEqual(exercise.muscle_groups, ["Chest", "Triceps"]);
    await pool.query("UPDATE users SET name = 'New name' WHERE id = $1", [creator.id]);
    const library = await (await get("/workouts/exercises", a)).text();
    assert.match(library, /Alex/);
    assert.doesNotMatch(library, /Forged name/);
    assert.doesNotMatch(await (await get("/workouts/exercises", b)).text(), /Test lift/);
    assert.doesNotMatch(await (await get("/workouts/exercises")).text(), /Test lift/);
    const plan = { name: "Personal plan", focus: "Push", goals: "Strength", muscle_groups: "Chest",
      minutes: "20", exercise: exercise.id, sets: "2", target: "10" };
    assert.equal((await post("/workouts/new", { ...plan, muscle_groups: "" }, a)).status, 400);
    assert.equal((await post("/workouts/new", plan, b)).status, 400);
    const workoutForm = new URLSearchParams(plan);
    workoutForm.delete("goals");
    assert.equal((await post("/workouts/new", workoutForm, a)).status, 400);
    workoutForm.append("goals", "Endurance");
    workoutForm.append("goals", "Strength");
    const path = (await post("/workouts/new", workoutForm, a)).headers.get("Location");
    assert.ok(path?.startsWith("/workouts/"));
    const detail = await (await get(path, a)).text();
    for (const label of ["Push", "Strength, Endurance", "Chest, Triceps", "Power, Endurance", "Alex"]) assert.ok(detail.includes(label));
    await pool.query(migration);
    assert.equal((await pool.query("SELECT id FROM training_exercises")).rowCount, 1);
    assert.equal((await pool.query("SELECT id FROM training_workouts")).rowCount, 1);
    assert.equal((await get(path, b)).status, 404);
    assert.doesNotMatch(await (await get("/workouts")).text(), /Personal plan/);
    const weeklyPath = "/workouts/weekly-plan";
    const monday = { intent: "add", day: "1", exercise: exercise.id, user_id: String(otherUser.id) };
    const sunday = { ...monday, day: "7" };
    assert.match((await get(weeklyPath)).headers.get("Location"), /sign-in/);
    assert.equal((await post(weeklyPath, monday, b)).status, 400);
    assert.equal((await post(weeklyPath, { ...monday, day: "8" }, a)).status, 400);
    assert.equal((await post(weeklyPath, monday, a)).headers.get("Location"), weeklyPath);
    assert.equal((await post(weeklyPath, sunday, a)).headers.get("Location"), weeklyPath);
    assert.equal((await post(weeklyPath, monday, a)).status, 400);
    await post(weeklyPath, { ...sunday, intent: "remove" }, b);
    const { rows: scheduled } = await pool.query("SELECT user_id, day_of_week, exercise_id FROM training_weekly_plan ORDER BY day_of_week");
    assert.deepEqual(scheduled, [1, 7].map(day => ({ user_id: creator.id, day_of_week: day, exercise_id: exercise.id })));
    await assert.rejects(pool.query("INSERT INTO training_weekly_plan VALUES ($1,1,$2)", [otherUser.id, exercise.id]),
      e => e.code === "23503");
    assert.doesNotMatch(await (await get(weeklyPath, b)).text(), /Test lift/);
    assert.equal((await post(weeklyPath, { ...monday, intent: "remove" }, a)).headers.get("Location"), weeklyPath);
    assert.deepEqual((await pool.query("SELECT day_of_week FROM training_weekly_plan")).rows, [{ day_of_week: 7 }]);

    const generate = { intent: "generate", strength_days: "1", endurance_days: "1", source: "picks", pick: exercise.id };
    for (const invalid of [{ endurance_days: "7" }, { pick: "missing" }, { source: "unknown" }, { strength_days: "0" }]) {
      assert.equal((await post(weeklyPath, { ...generate, ...invalid }, a)).status, 400);
    }
    assert.equal((await post(weeklyPath, generate, b)).status, 400);
    assert.equal((await post(weeklyPath, generate, a)).headers.get("Location"), weeklyPath);
    const { rows: dayKinds } = await pool.query(
      "SELECT kind, count(*)::int AS n FROM training_weekly_days WHERE user_id = $1 GROUP BY kind ORDER BY kind", [creator.id]);
    assert.deepEqual(dayKinds, [{ kind: "Endurance", n: 1 }, { kind: "Rest", n: 5 }, { kind: "Strength", n: 1 }]);
    const { rows: generated } = await pool.query(
      `SELECT p.exercise_id, d.kind FROM training_weekly_plan p
       JOIN training_weekly_days d USING (user_id, day_of_week) WHERE p.user_id = $1`, [creator.id]);
    assert.deepEqual(generated, [{ exercise_id: exercise.id, kind: "Strength" }]);
    assert.match(await (await get(weeklyPath, a)).text(), /Rest day/);

    const session = { submission: randomUUID(), date: "2026-11-20", notes: "First session", "quantity-1-1": "8", "weight-1-1": "12.5", "quantity-1-3": "6" };
    assert.equal((await post(path + "/log", { ...session, date: "2026-02-30" }, a)).status, 400);
    assert.equal((await post(path + "/log", session, b)).status, 404);
    const saves = await Promise.all([post(path + "/log", session, a), post(path + "/log", session, a)]);
    assert.ok(saves.every(r => r.headers.get("Location") === "/workouts/log"));
    const { rows: sessions } = await pool.query("SELECT movements FROM training_sessions");
    assert.equal(sessions.length, 1);
    assert.deepEqual(sessions[0].movements, [{ name: "Test lift", author_name: "Alex", unit: "reps", sets: [{ quantity: 8, weight: 12.5 }, { quantity: 6, weight: null }] }]);
    assert.match(await (await get("/workouts/log", a)).text(), /First session/);
    assert.doesNotMatch(await (await get("/workouts/log", b)).text(), /First session/);
    assert.equal((await post("/workouts", {}, a)).headers.get("Location"), "/workouts");
    assert.match((await get("/workouts/log", a)).headers.get("Location"), /sign-in/);
  } finally {
    await pool.end();
    await admin.query("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
    await admin.end();
  }
});
