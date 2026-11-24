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
    assert.equal((await get("/workouts")).headers.get("Location"), "/workouts/log");
    assert.match((await get("/workouts/log")).headers.get("Location"), /sign-in/);
    const login = async email => {
      const response = await post("/workouts/sign-in?next=/workouts/log", { email, password: "demo-pass" });
      assert.equal(response.headers.get("Location"), "/workouts/log");
      return response.headers.get("set-cookie").split(";")[0];
    };
    const a = await login("a@example.test"), b = await login("b@example.test");
    assert.match(await (await get("/workouts/weekly-plan", a)).text(), /Add your first exercise/);
    assert.match(await (await get("/workouts/log", a)).text(), /No week locked in/);
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
    assert.equal((await post("/workouts/exercises/new?next=weekly-plan", form, a)).headers.get("Location"), "/workouts/weekly-plan");
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
    for (const label of ["Push", "Chest, Triceps", "Power, Endurance", "Alex"]) assert.ok(library.includes(label));
    await pool.query(migration);
    assert.equal((await pool.query("SELECT id FROM training_exercises")).rowCount, 1);
    const weeklyPath = "/workouts/weekly-plan";
    const today = new Date().toISOString().slice(0, 10);
    const shift = days => new Date(Date.parse(today) + days * 864e5).toISOString().slice(0, 10);
    const weekdayOffset = (new Date(today).getUTCDay() + 6) % 7;
    const week = shift(-weekdayOffset);
    const pastFriday = shift(-weekdayOffset - 3);
    const { rows: [past] } = await pool.query(
      "INSERT INTO training_plan_days (user_id, planned_on, kind, locked) VALUES ($1,$2,'Strength',true) RETURNING id",
      [creator.id, pastFriday]);
    await assert.rejects(pool.query("INSERT INTO training_plan_exercises VALUES ($1,$2,2,$3,true)", [otherUser.id, past.id, exercise.id]),
      e => e.code === "23503");
    await pool.query("INSERT INTO training_plan_exercises VALUES ($1,$2,1,$3,true)", [creator.id, past.id, exercise.id]);
    const plan = (fields, cookie = a) => {
      const form = new URLSearchParams(fields);
      form.set("week", week);
      return post(weeklyPath, form, cookie);
    };
    const readWeek = async (lockedOnly = false) => (await pool.query(
      `SELECT to_char(d.planned_on, 'YYYY-MM-DD') AS date, extract(isodow FROM d.planned_on)::int AS day,
         p.position, p.exercise_id AS id, p.assigned
       FROM training_plan_days d JOIN training_plan_exercises p ON p.day_id = d.id
       WHERE d.user_id = $1 AND d.planned_on BETWEEN $2 AND $2::date + 6 AND (NOT $3 OR d.locked)
       ORDER BY d.planned_on, p.position`, [creator.id, week, lockedOnly])).rows;
    const readDays = async () => (await pool.query(
      `SELECT kind, locked FROM training_plan_days WHERE user_id = $1 AND planned_on BETWEEN $2 AND $2::date + 6
       ORDER BY planned_on`, [creator.id, week])).rows;
    const add = (day, exercise, cookie) => plan({ intent: "add", day, exercise }, cookie);
    const switchTo = (day, exercise, replacement) => plan({ intent: "switch", day, exercise, replacement });
    assert.deepEqual(await readDays(), []);
    assert.match((await get(weeklyPath)).headers.get("Location"), /sign-in/);
    assert.equal((await add(1, exercise.id, b)).status, 400);
    assert.equal((await add(8, exercise.id)).status, 400);
    assert.equal((await post(weeklyPath, { week: shift(-weekdayOffset - 14), intent: "add", day: 1, exercise: exercise.id }, a)).status, 400);
    assert.equal((await plan({intent: "lock"})).status, 400);
    assert.deepEqual(await readDays(), []);
    assert.equal((await add(1, exercise.id)).headers.get("Location"), weeklyPath);
    assert.equal((await add(1, exercise.id)).status, 400);
    await pool.query(migration);
    assert.equal((await readWeek()).length, 1);
    assert.doesNotMatch(await (await get(weeklyPath, b)).text(), /Test lift/);
    assert.equal((await plan({intent: "remove", day: 1, exercise: exercise.id})).status, 302);
    assert.deepEqual(await readWeek(), []);

    for (const [name, focus, group] of [
      ["Other press", "Push", "Chest"], ["Triceps extension", "Push", "Triceps"],
      ["Row", "Pull", "Lats"], ["Curl", "Pull", "Biceps"], ["Squat", "Legs", "Quads"],
      ["Plank", "Core", "Abs"], ["Bridge", "Legs", "Glutes"], ["Bike", "Cardio", "Quads"],
    ]) {
      await pool.query(`INSERT INTO training_exercises (id, author_id, author_name, name, focus, goals, muscle_groups, unit)
        VALUES ($1,$2,'Alex',$1,$3,ARRAY['Strength'],ARRAY[$4::text],'reps')`, [name, creator.id, focus, group]);
    }
    assert.equal((await add(1, exercise.id)).status, 302);
    assert.equal((await add(3, "Bike")).status, 302);
    const saved = await readWeek();
    const fill = { intent: "generate", strength_days: "2", endurance_days: "1", source: "random" };
    for (const extra of [{ strength_days: "7" }, { strength_days: "0" }, { endurance_days: "0" },
      { source: "unknown" }, {source: "picks", pick: "missing"}, {rest_day: "1"}, { rest_day: "8" },
      { assigned_8: "Row" }, { assigned_5: "missing" }, { assigned_3: "Curl" }]) {
      assert.equal((await plan({...fill, ...extra})).status, 400);
      assert.deepEqual(await readWeek(), saved);
    }
    const assignments = new URLSearchParams({ ...fill, assigned_5: "Bridge", rest_day: "2" });
    assignments.append("assigned_5", "Plank");
    assert.equal((await plan(assignments, b)).status, 400);
    for (const source of ["picks", "random", "mix"]) {
      assignments.set("source", source);
      assert.equal((await plan(assignments)).status, 302);
      const rows = await readWeek();
      assert.deepEqual(rows.filter(e => e.day === 5 && e.assigned).map(e => e.id), ["Bridge", "Plank"]);
      assert.deepEqual(rows.filter(e => e.day === 3).map(e => e.id), ["Bike"]);
      assert.ok(rows.some(e => e.day === 1 && e.id === exercise.id));
      assert.equal((await readDays())[1].kind, "Rest");
      if (source === "picks") assert.equal(rows.length, 4);
      else assert.deepEqual(rows.filter(e => e.day === 5).map(e => e.id),
        ["Other press", "Triceps extension", "Row", "Curl", "Squat", "Bridge", "Plank"]);
    }
    const beforeSwap = await readWeek();
    const swapDays = (day, other) => plan({ intent: "swap-days", day, with: other });
    assert.equal((await swapDays(1,1)).status, 400);
    assert.equal((await swapDays(3,5)).status, 302);
    assert.deepEqual((await readWeek()).filter(e => e.day === 3).map(e => e.id), beforeSwap.filter(e => e.day === 5).map(e => e.id));
    assert.equal((await readDays())[4].kind, "Endurance");
    assert.equal((await swapDays(3,5)).status, 302);
    assert.deepEqual(await readWeek(), beforeSwap);
    assert.equal((await switchTo(1, exercise.id, "missing")).status, 400);
    assert.equal((await switchTo(1, exercise.id, "Squat")).status, 400);
    assert.equal((await switchTo(1, exercise.id, "Other press")).status, 302);
    assert.equal((await switchTo(5, "Bridge", "rest")).status, 302);
    assert.equal((await readDays())[4].kind, "Rest");
    assert.equal((await add(5, "Plank")).status, 302);
    const edits = await Promise.all([add(5, "Bridge"), plan({...fill, source: "picks"})]);
    assert.ok(edits.every(response => response.status === 302));
    assert.ok((await readWeek()).some(e => e.id === "Bridge" && e.assigned && e.day === 5));
    assert.deepEqual(await readWeek(true), []);
    assert.equal((await get("/workouts/log/" + week, a)).status, 404);
    const planBeforeLock = await readWeek();
    assert.equal((await plan({intent: "lock"})).headers.get("Location"), "/workouts/log");
    assert.equal((await plan({intent: "lock"})).status, 302);
    const lockedRows = () => readWeek(true);
    const locked = await lockedRows();
    assert.deepEqual(locked, planBeforeLock);
    const days = await readDays();
    assert.equal(days.length, 7);
    assert.ok(days.every(d => d.locked));
    assert.match(await (await get("/workouts/log", a)).text(), /Week of/);
    assert.match(await (await get(weeklyPath, a)).text(), /Open this week in the training log/);
    assert.equal((await pool.query("SELECT exercise_id FROM training_plan_exercises WHERE day_id = $1", [past.id])).rows[0].exercise_id, exercise.id);
    assert.equal((await get("/workouts/log/" + pastFriday, a)).status, 200);

    const day = locked[0];
    const dayPath = "/workouts/log/" + day.date;
    assert.equal((await get(dayPath, b)).status, 404);
    assert.equal((await get("/workouts/log/2026-02-30", a)).status, 404);
    assert.match(await (await get(dayPath, a)).text(), new RegExp(day.id));
    await pool.query(`INSERT INTO training_exercises (id, author_id, author_name, name, focus, goals, muscle_groups, unit)
      VALUES ('Swap lift',$1,'Alex','Swap lift','Push',ARRAY['Strength'],ARRAY['Chest'],'reps'),
             ('Other user lift',$2,'Sam','Other user lift','Push',ARRAY['Strength'],ARRAY['Chest'],'reps')`, [creator.id, otherUser.id]);
    const swap = { intent: "swap", position: String(day.position), exercise: "Swap lift" };
    assert.equal((await post(dayPath, { ...swap, exercise: "Other user lift" }, a)).status, 400);
    assert.equal((await post(dayPath, swap, b)).status, 400);
    assert.equal((await post(dayPath, swap, a)).status, 200);
    assert.equal((await post(dayPath, { intent: "add", exercise: "Swap lift" }, a)).status, 400);
    assert.equal((await lockedRows()).find(r => r.date === day.date && r.position === day.position).id, "Swap lift");
    assert.equal((await readWeek()).find(e => e.date === day.date && e.position === day.position).id, "Swap lift");
    assert.equal((await post(dayPath, { intent: "add", exercise: day.id }, a)).status, 200);
    const added = (await lockedRows()).filter(r => r.date === day.date).at(-1);
    assert.equal(added.id, day.id);
    assert.equal((await post(dayPath, { intent: "remove", position: String(added.position) }, a)).status, 200);
    assert.ok(!(await lockedRows()).some(r => r.date === day.date && r.id === day.id));

    const p = day.position;
    const fields = async path => {
      const html = await (await get(path, a)).text();
      return new Map([...html.matchAll(/<input\b[^>]*>/g)].map(([tag]) =>
        [tag.match(/ name="([^"]+)"/)?.[1], tag.match(/ value="([^"]*)"/)?.[1] ?? ""]));
    };
    const fresh = await fields(dayPath);
    assert.equal(fresh.get(`quantity-${p}-1`), "");
    assert.ok(!fresh.has(`quantity-${p}-2`));
    const session = { intent: "record", submission: randomUUID(), date: shift(-8), notes: "First session",
      ["exercise-" + p]: "Swap lift", [`quantity-${p}-1`]: "8", [`weight-${p}-1`]: "12.5", [`quantity-${p}-3`]: "6" };
    assert.equal((await post(dayPath, { ...session, date: "2026-02-30" }, a)).status, 400);
    assert.equal((await post(dayPath, { ...session, ["exercise-" + p]: day.id }, a)).status, 400);
    assert.equal((await post(dayPath, session, b)).status, 404);
    const saves = await Promise.all([post(dayPath, session, a), post(dayPath, session, a)]);
    assert.ok(saves.every(r => r.headers.get("Location") === "/workouts/log"));
    const { rows: sessions } = await pool.query("SELECT workout_name, movements FROM training_sessions");
    assert.equal(sessions.length, 1);
    assert.match(sessions[0].workout_name, /^\w+day strength$/);
    assert.deepEqual(sessions[0].movements, [{ exercise_id: "Swap lift", name: "Swap lift", author_name: "Alex", unit: "reps", sets: [{ quantity: 8, weight: 12.5 }, { quantity: 6, weight: null }] }]);
    // Older sessions had no exercise ID. They still prefill an unambiguous match.
    await pool.query("UPDATE training_sessions SET movements = movements #- '{0,exercise_id}'");
    assert.equal((await post(dayPath, { ...session, submission: randomUUID(), date: shift(8), [`quantity-${p}-1`]: "50" }, a)).status, 302);
    const repeat = await fields(dayPath);
    assert.equal(repeat.get(`quantity-${p}-1`), "8");
    assert.equal(repeat.get(`weight-${p}-1`), "12.5");
    assert.equal(repeat.get(`quantity-${p}-2`), "6");
    assert.equal(repeat.get(`weight-${p}-2`), "");
    assert.ok(!repeat.has(`quantity-${p}-3`));

    const bike = locked.find(e => e.id === "Bike");
    const bikePath = "/workouts/log/" + bike.date;
    const first = bike.position + "-1", second = bike.position + "-2";
    const cardio = { intent: "record", submission: randomUUID(), date: bike.date,
      ["exercise-" + bike.position]: "Bike", ["time-" + first]: "12.5", ["watts-" + first]: "180", ["time-" + second]: "5" };
    const newCardio = await fields(bikePath);
    assert.equal(newCardio.get("time-" + first), "");
    assert.ok(!newCardio.has("time-" + second));
    assert.ok(!newCardio.has("weight-" + first) && !newCardio.has("quantity-" + first));
    for (const invalid of [{ ["time-" + first]: "" }, { ["time-" + first]: "0" }, { ["watts-" + first]: "-1" }]) {
      assert.equal((await post(bikePath, { ...cardio, ...invalid }, a)).status, 400);
    }
    assert.equal((await post(bikePath, cardio, a)).status, 302);
    const bikeHistory = await fields(bikePath);
    assert.equal(bikeHistory.get("time-" + first), "12.5");
    assert.equal(bikeHistory.get("watts-" + first), "180");
    assert.equal(bikeHistory.get("time-" + second), "5");
    assert.equal(bikeHistory.get("watts-" + second), "");
    const history = await (await get("/workouts/log", a)).text();
    assert.match(history, /180 W/);
    assert.match(history, /12.5 lb/);
    assert.match(history, /minutes/);
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
