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
    assert.equal((await pool.query("SELECT id FROM training_exercises")).rowCount, 16);
    assert.equal((await pool.query("SELECT id FROM training_workouts")).rowCount, 6);
    await pool.query("INSERT INTO users (email, password_hash) VALUES ('a@example.test',$1), ('b@example.test',$1)", [await bcrypt.hash("demo-pass", 4)]);
    const handle = createRequestHandler(await import("../build/server/index.js"), "production");
    const get = (path, cookie = "") => handle(new Request(host + path, { headers: { Cookie: cookie } }));
    const post = (path, form, cookie = "") => handle(new Request(host + path, {
      method: "POST", headers: { Cookie: cookie, Origin: host }, body: new URLSearchParams(form),
    }));
    assert.equal((await get("/")).headers.get("Location"), "/workouts");
    assert.equal((await handle(new Request("https://torchsnuffers.com/"))).status, 200);
    assert.match(await (await get("/workouts")).text(), /Full body foundation/);
    assert.match((await get("/workouts/log")).headers.get("Location"), /sign-in/);
    const login = async email => {
      const response = await post("/workouts/sign-in?next=/workouts/log", { email, password: "demo-pass" });
      assert.equal(response.headers.get("Location"), "/workouts/log");
      return response.headers.get("set-cookie").split(";")[0];
    };
    const a = await login("a@example.test"), b = await login("b@example.test");
    assert.equal((await post("/workouts/exercises/new", { name: "Test lift", focus: "Full body", equipment: "Cable", unit: "reps" }, a)).status, 302);
    const { rows: [exercise] } = await pool.query("SELECT id FROM training_exercises WHERE name = 'Test lift'");
    assert.doesNotMatch(await (await get("/workouts/exercises", b)).text(), /Test lift/);
    const plan = { name: "Personal plan", focus: "Core", minutes: "20", exercise: exercise.id, sets: "2", target: "10" };
    assert.equal((await post("/workouts/new", plan, b)).status, 400);
    const path = (await post("/workouts/new", plan, a)).headers.get("Location");
    assert.ok(path?.startsWith("/workouts/"));
    assert.equal((await get(path, b)).status, 404);
    assert.doesNotMatch(await (await get("/workouts")).text(), /Personal plan/);
    const session = { submission: randomUUID(), date: "2026-11-20", notes: "First session", "quantity-1-1": "8", "weight-1-1": "12.5", "quantity-1-3": "6" };
    assert.equal((await post(path + "/log", { ...session, date: "2026-02-30" }, a)).status, 400);
    assert.equal((await post(path + "/log", session, b)).status, 404);
    const saves = await Promise.all([post(path + "/log", session, a), post(path + "/log", session, a)]);
    assert.ok(saves.every(r => r.headers.get("Location") === "/workouts/log"));
    const { rows: sessions } = await pool.query("SELECT movements FROM training_sessions");
    assert.equal(sessions.length, 1);
    assert.deepEqual(sessions[0].movements, [{ name: "Test lift", unit: "reps", sets: [{ quantity: 8, weight: 12.5 }, { quantity: 6, weight: null }] }]);
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
