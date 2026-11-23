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
    // Simulate an upgrade from a plan without pin tracking. Only Monday was purely manual.
    await pool.query("ALTER TABLE training_weekly_plan DROP COLUMN pinned");
    await pool.query("INSERT INTO training_weekly_days VALUES ($1,7,'Strength')", [creator.id]);
    await pool.query(migration);
    assert.deepEqual((await pool.query("SELECT pinned FROM training_weekly_plan ORDER BY day_of_week")).rows,
      [{ pinned: true }, { pinned: false }]);
    assert.equal((await post(weeklyPath, sunday, a)).headers.get("Location"), weeklyPath);
    await pool.query(migration);
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

    for (const [name, focus, group] of [
      ["Other press", "Push", "Chest"], ["Triceps extension", "Push", "Triceps"],
      ["Row", "Pull", "Lats"], ["Curl", "Pull", "Biceps"], ["Squat", "Legs", "Quads"],
      ["Plank", "Core", "Abs"], ["Bike", "Cardio", "Quads"],
    ]) {
      await pool.query(`INSERT INTO training_exercises (id, author_id, author_name, name, focus, goals, muscle_groups, unit)
        VALUES ($1,$2,'Alex',$1,$3,ARRAY['Strength'],ARRAY[$4::text],'reps')`, [name, creator.id, focus, group]);
    }
    const add = (day, id) => post(weeklyPath, { intent: "add", day, exercise: id }, a);
    assert.equal((await add("1", exercise.id)).status, 302);
    assert.equal((await add("7", "Triceps extension")).status, 302);
    assert.equal((await add("3", "Bike")).status, 302);
    assert.equal((await add("1", "Other press")).status, 400);
    assert.equal((await add("3", "Plank")).status, 400);
    const readWeek = async () => (await pool.query(
      `SELECT day_of_week AS day, exercise_id AS id, pinned FROM training_weekly_plan
       WHERE user_id = $1 ORDER BY day_of_week, position`, [creator.id])).rows;
    const pinned = await readWeek();
    const fill = { ...generate, strength_days: "2", source: "random" };
    assert.equal((await post(weeklyPath, { ...fill, strength_days: "1" }, a)).status, 400);
    assert.equal((await post(weeklyPath, { ...fill, endurance_days: "0" }, a)).status, 400);
    assert.equal((await post(weeklyPath, { ...fill, source: "mix", pick: "Other press" }, a)).status, 400);
    assert.deepEqual(await readWeek(), pinned);
    const strengthOrder = [exercise.id, "Triceps extension", "Row", "Curl", "Squat", "Plank"];
    for (const source of ["random", "mix"]) {
      assert.equal((await post(weeklyPath, { ...fill, source }, a)).status, 302);
      const week = await readWeek();
      for (const day of [1, 7]) assert.deepEqual(week.filter(e => e.day === day).map(e => e.id), strengthOrder);
      assert.deepEqual(week.filter(e => e.day === 3), [{ day: 3, id: "Bike", pinned: true }]);
      assert.equal(week.filter(e => e.pinned).length, 4);
    }
    // Swap whole days, including two strength days that share every exercise.
    const swapDays = (day, other, cookie = a) => post(weeklyPath, { intent: "swap-days", day, with: other }, cookie);
    const readKinds = async () => (await pool.query(
      "SELECT day_of_week AS day, kind FROM training_weekly_days WHERE user_id = $1 ORDER BY day_of_week", [creator.id])).rows;
    const [beforeSwap, kindsBeforeSwap] = [await readWeek(), await readKinds()];
    for (const invalid of [["1", "1"], ["1", "8"], ["0", "3"]]) assert.equal((await swapDays(...invalid)).status, 400);
    assert.equal((await swapDays("1", "3")).headers.get("Location"), weeklyPath);
    const swappedWeek = await readWeek();
    assert.deepEqual(swappedWeek.filter(e => e.day === 3), beforeSwap.filter(e => e.day === 1).map(e => ({ ...e, day: 3 })));
    assert.deepEqual(swappedWeek.filter(e => e.day === 1), beforeSwap.filter(e => e.day === 3).map(e => ({ ...e, day: 1 })));
    const swappedKinds = await readKinds();
    assert.equal(swappedKinds.find(k => k.day === 1).kind, kindsBeforeSwap.find(k => k.day === 3).kind);
    assert.equal(swappedKinds.find(k => k.day === 3).kind, kindsBeforeSwap.find(k => k.day === 1).kind);
    await swapDays("3", "1");
    assert.equal((await swapDays("7", "1")).status, 302);
    assert.notDeepEqual(await readWeek(), beforeSwap);
    await swapDays("1", "7");
    await swapDays("1", "3", b);
    assert.deepEqual([await readWeek(), await readKinds()], [beforeSwap, kindsBeforeSwap]);
    // Chosen rest days stay free; the rest of the week is still filled.
    for (const [restDays, extra] of [[["2", "2"]], [["9"]], [["1"]], [["2", "4", "5", "6"], { endurance_days: "2" }]]) {
      const body = new URLSearchParams({ ...fill, ...extra });
      for (const day of restDays) body.append("rest_day", day);
      assert.equal((await post(weeklyPath, body, a)).status, 400);
    }
    assert.deepEqual(await readWeek(), beforeSwap);
    const restful = new URLSearchParams({ ...fill });
    for (const day of ["2", "4", "5"]) restful.append("rest_day", day);
    for (let run = 0; run < 5; run++) {
      assert.equal((await post(weeklyPath, restful, a)).status, 302);
      const kinds = await readKinds();
      for (const day of [2, 4, 5]) assert.equal(kinds.find(k => k.day === day).kind, "Rest");
      assert.deepEqual(kinds.filter(k => k.kind === "Strength").map(k => k.day), [1, 7]);
      assert.equal(kinds.filter(k => k.kind === "Endurance").length, 1);
    }
    // Pin an auto-filled slot while a new week is being generated.
    const simultaneous = await Promise.all([add("1", "Squat"), post(weeklyPath, fill, a)]);
    assert.ok(simultaneous.every(r => r.status === 302));
    assert.equal((await post(weeklyPath, { ...fill, source: "picks" }, a)).status, 302);
    const onlyPins = await readWeek();
    assert.equal(onlyPins.length, 5);
    assert.ok(onlyPins.every(e => e.pinned));
    assert.ok(onlyPins.some(e => e.day === 1 && e.id === "Squat"));
    assert.equal((await post(weeklyPath, { ...sunday, intent: "remove" }, a)).status, 302);
    assert.equal((await post(weeklyPath, { intent: "generate", strength_days: "2", endurance_days: "1", source: "picks" }, a)).status, 302);
    assert.ok(!(await readWeek()).some(e => e.day === 7 && e.id === exercise.id));

    // Lock the plan onto this week's dates, then log one of its days.
    const today = new Date().toISOString().slice(0, 10);
    const shift = days => new Date(Date.parse(today) + days * 864e5).toISOString().slice(0, 10);
    assert.equal((await post(weeklyPath, { intent: "lock", today: shift(5) }, a)).status, 400);
    assert.equal((await post(weeklyPath, { intent: "lock", today }, b)).status, 400);
    const planBeforeLock = await readWeek();
    assert.equal((await post(weeklyPath, { intent: "lock", today }, a)).headers.get("Location"), "/workouts/log");
    assert.equal((await post(weeklyPath, { intent: "lock", today }, a)).status, 302);
    const lockedRows = async () => (await pool.query(
      `SELECT to_char(planned_on, 'YYYY-MM-DD') AS date, extract(isodow FROM planned_on)::int AS day, position, exercise_id AS id
       FROM training_locked_exercises WHERE user_id = $1 ORDER BY planned_on, position`, [creator.id])).rows;
    const locked = await lockedRows();
    assert.deepEqual(locked.map(({ day, id }) => ({ day, id })), planBeforeLock.map(({ day, id }) => ({ day, id })));
    const { rows: lockedDays } = await pool.query(
      "SELECT to_char(min(planned_on), 'YYYY-MM-DD') AS start, count(*)::int AS n FROM training_locked_days WHERE user_id = $1", [creator.id]);
    assert.equal(lockedDays[0].n, 7);
    assert.equal(new Date(lockedDays[0].start).getUTCDay(), 1);
    assert.ok(lockedDays[0].start <= today && today <= shift(6 - ((new Date(today).getUTCDay() + 6) % 7)));
    assert.match(await (await get("/workouts/log", a)).text(), /Week of/);
    assert.match(await (await get("/workouts/weekly-plan", a)).text(), /This week is locked in/);

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
    assert.deepEqual(await readWeek(), planBeforeLock);
    assert.equal((await post(dayPath, { intent: "add", exercise: day.id }, a)).status, 200);
    const added = (await lockedRows()).filter(r => r.date === day.date).at(-1);
    assert.equal(added.id, day.id);
    assert.equal((await post(dayPath, { intent: "remove", position: String(added.position) }, a)).status, 200);
    assert.ok(!(await lockedRows()).some(r => r.date === day.date && r.id === day.id));

    const p = day.position;
    const session = { intent: "record", submission: randomUUID(), date: "2026-11-20", notes: "First session",
      ["exercise-" + p]: "Swap lift", [`quantity-${p}-1`]: "8", [`weight-${p}-1`]: "12.5", [`quantity-${p}-3`]: "6" };
    assert.equal((await post(dayPath, { ...session, date: "2026-02-30" }, a)).status, 400);
    assert.equal((await post(dayPath, { ...session, ["exercise-" + p]: day.id }, a)).status, 400);
    assert.equal((await post(dayPath, session, b)).status, 404);
    const saves = await Promise.all([post(dayPath, session, a), post(dayPath, session, a)]);
    assert.ok(saves.every(r => r.headers.get("Location") === "/workouts/log"));
    const { rows: sessions } = await pool.query("SELECT workout_name, movements FROM training_sessions");
    assert.equal(sessions.length, 1);
    assert.match(sessions[0].workout_name, /^\w+day strength$/);
    assert.deepEqual(sessions[0].movements, [{ name: "Swap lift", author_name: "Alex", unit: "reps", sets: [{ quantity: 8, weight: 12.5 }, { quantity: 6, weight: null }] }]);
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
