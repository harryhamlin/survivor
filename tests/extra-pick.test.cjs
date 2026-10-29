const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const ts = require('typescript');
const { Pool } = require('pg');

const connectionString = process.env.EXTRA_PICK_TEST_DATABASE_URL;

test('fourth-pick migration, eligibility, editing, and concurrent submissions', {
  skip: !connectionString && 'Set EXTRA_PICK_TEST_DATABASE_URL to a disposable local PostgreSQL database',
}, async () => {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'Only use a local test database');
  const schema = 'extra_pick_test_' + crypto.randomBytes(8).toString('hex');
  const admin = new Pool({ connectionString });
  const pool = new Pool({ connectionString, options: `-c search_path=${schema}` });
  try {
    await admin.query(`CREATE SCHEMA ${schema}`);
    // Existing seasons retain their initial roster size when the new settings arrive.
    await pool.query(`CREATE TABLE seasons (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'upcoming',
      finalist_count INTEGER NOT NULL DEFAULT 3, draft_lock_at TIMESTAMPTZ
    ); INSERT INTO seasons (name, status, finalist_count) VALUES ('Test', 'active', 3)`);
    const sql = fs.readFileSync('db/schema.sql', 'utf8');
    await pool.query(sql);
    await pool.query(sql); // Release migrations must be safe to repeat.
    const { rows: [season] } = await pool.query('SELECT * FROM seasons LIMIT 1');
    assert.equal(season.draft_team_size, 3);
    assert.equal(season.finalist_count, 3);
    assert.equal(season.extra_pick_enabled, false);
    assert.equal(season.extra_pick_lock_at, null);

    const code = ts.transpileModule(fs.readFileSync('app/extra-pick.server.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const exports = {};
    new Function('require', 'exports', code)(() => pool, exports);
    const { saveExtraPick, isExtraPickOpen } = exports;
    const now = Date.now();
    const window = { extraPickEnabled: true, extraPickLockAt: new Date(now + 10000), draftLockAt: new Date(now - 1000) };
    assert.equal(isExtraPickOpen(window, now), true);
    assert.equal(isExtraPickOpen({ ...window, extraPickEnabled: false }, now), false);
    assert.equal(isExtraPickOpen({ ...window, extraPickLockAt: null }, now), false);
    assert.equal(isExtraPickOpen({ ...window, extraPickLockAt: new Date(now) }, now), false);
    assert.equal(isExtraPickOpen({ ...window, draftLockAt: null }, now), false);
    assert.equal(isExtraPickOpen({ ...window, draftLockAt: new Date(now + 1000) }, now), false);

    await pool.query("INSERT INTO users (email, password_hash) VALUES ('test@example.com','test-only'), ('late@example.com','test-only')");
    const { rows: [player] } = await pool.query("INSERT INTO fantasy_players (display_name, email, user_id) SELECT 'Test', email, id FROM users WHERE email = 'test@example.com' RETURNING id");
    const { rows: contestants } = await pool.query('SELECT id FROM contestants WHERE season_id = $1 ORDER BY id LIMIT 6', [season.id]);
    const ids = contestants.map(c => c.id);
    for (const [index, id] of ids.slice(0, 3).entries()) {
      await pool.query('INSERT INTO draft_picks (season_id, player_id, contestant_id, is_ultimate_pick) VALUES ($1,$2,$3,$4)', [season.id, player.id, id, index === 0]);
    }
    const roster = async () => (await pool.query('SELECT * FROM draft_picks WHERE player_id = $1 ORDER BY contestant_id', [player.id])).rows;
    const originals = await roster();
    const save = id => saveExtraPick(season.id, player.id, id);
    assert.match((await save(ids[3])).error, /closed/);
    await pool.query("UPDATE seasons SET extra_pick_enabled = true, draft_lock_at = now() - interval '1 day' WHERE id = $1", [season.id]);
    assert.match((await save(ids[3])).error, /closed/); // Deadline is required.
    await pool.query("UPDATE seasons SET extra_pick_lock_at = now() + interval '1 day' WHERE id = $1", [season.id]);
    assert.match((await save(ids[0])).error, /already/);
    assert.match((await save(999999)).error, /still in the game/);
    assert.ok((await save(NaN)).error);
    assert.deepEqual(await save(ids[3]), { success: true });
    assert.deepEqual(await save(ids[4]), { success: true });
    const simultaneous = await Promise.all([save(ids[3]), save(ids[4])]);
    assert.ok(simultaneous.every(result => result.success));
    const saved = await roster();
    assert.equal(saved.length, 4);
    assert.deepEqual(saved.filter(p => !p.is_extra_pick), originals);
    assert.equal(saved.filter(p => p.is_extra_pick).length, 1);
    assert.equal(saved.find(p => p.is_extra_pick).is_ultimate_pick, false);
    const { rows: [episode] } = await pool.query('SELECT id FROM episodes LIMIT 1');
    await pool.query('INSERT INTO episode_results (episode_id) VALUES ($1)', [episode.id]);
    await pool.query('INSERT INTO episode_eliminations (episode_id, contestant_id) VALUES ($1,$2)', [episode.id, ids[5]]);
    assert.match((await save(ids[5])).error, /still in the game/);
    const { rows: [otherSeason] } = await pool.query("INSERT INTO seasons (name) VALUES ('Other') RETURNING id");
    const { rows: [outsider] } = await pool.query("INSERT INTO contestants (season_id, name) VALUES ($1,'Other') RETURNING id", [otherSeason.id]);
    assert.match((await save(outsider.id)).error, /still in the game/);
    const { rows: [latePlayer] } = await pool.query("INSERT INTO fantasy_players (display_name, email, user_id) SELECT 'Late', email, id FROM users WHERE email = 'late@example.com' RETURNING id");
    assert.match((await saveExtraPick(season.id, latePlayer.id, ids[3])).error, /existing team/);
    await pool.query("UPDATE seasons SET extra_pick_lock_at = now() - interval '1 second' WHERE id = $1", [season.id]);
    assert.match((await save(ids[3])).error, /closed/);
    assert.deepEqual(await roster(), saved);

    // Run the real leaderboard loader against distinct picks to verify heading/cell alignment.
    const { rows: [tribe] } = await pool.query('SELECT id FROM tribes WHERE season_id = $1 LIMIT 1', [season.id]);
    for (const [number, contestantId] of [[2, ids[0]], [3, ids[1]]]) {
      const { rows: [ep] } = await pool.query(
        "INSERT INTO episodes (season_id, episode_number, picks_lock_at) VALUES ($1,$2,now() + interval '1 day') RETURNING id",
        [season.id, number],
      );
      await pool.query(
        'INSERT INTO weekly_picks (episode_id, player_id, elimination_pick_id, immunity_tribe_pick_id) VALUES ($1,$2,$3,$4)',
        [ep.id, player.id, contestantId, tribe.id],
      );
    }
    const cache = new Map();
    function load(file) {
      file = path.resolve(file);
      if (file.endsWith('/db.server.ts')) return { __esModule: true, default: pool };
      if (file.endsWith('/session.server.ts')) return { requireUserId: async () => (await pool.query("SELECT id FROM users WHERE email = 'test@example.com'")).rows[0].id };
      if (file.endsWith('/players.server.ts')) return { getOrCreateFantasyPlayer: async () => player };
      if (file.includes('/components/')) return {};
      if (cache.has(file)) return cache.get(file);
      const result = {};
      cache.set(file, result);
      const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
      }).outputText;
      new Function('require', 'exports', compiled)(name => name.startsWith('.')
        ? load(path.resolve(path.dirname(file), name + (name.includes('/components/') ? '.tsx' : '.ts')))
        : require(name), result);
      return result;
    }
    const leaderboard = await load('app/routes/leaderboard.tsx').loader({ request: new Request('http://localhost/leaderboard') });
    assert.deepEqual(leaderboard.episodeNumbers, [3, 2]);
    const { rows: names } = await pool.query('SELECT name FROM contestants WHERE id = ANY($1) ORDER BY id DESC', [ids.slice(0, 2)]);
    assert.deepEqual(leaderboard.rows.find(row => row.playerId === player.id).picks.map(pick => pick.eliminationPickName), names.map(row => row.name));

  } finally {
    await pool.end();
    await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    await admin.end();
  }
});
