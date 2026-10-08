const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

test('a non-scoring departure stays eliminated while the legitimate boot scores', async () => {
  const pool = {
    async query(sql) {
      if (sql.startsWith('SELECT id, episode_number, immunity_type FROM episodes')) return { rows: [
        { id: 1, episode_number: 1, immunity_type: 'tribe' },
        { id: 2, episode_number: 2, immunity_type: 'tribe' },
      ] };
      if (sql.includes('FROM episode_eliminations')) return { rows: [
        { episode_id: 1, contestant_id: 10, counts_for_scoring: false },
        { episode_id: 1, contestant_id: 11, counts_for_scoring: true },
      ] };
      if (sql.includes('FROM episode_immunity_winners')) return { rows: [
        { episode_id: 1, tribe_id: 3, contestant_id: null },
      ] };
      if (sql.includes('FROM episode_scoring')) return { rows: [
        { episode_id: 1, category: 'elimination', status: 'active' },
        { episode_id: 1, category: 'immunity', status: 'active' },
      ] };
      if (sql.includes('count(*)')) return { rows: [{ count: 10 }] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  const source = readFileSync('app/scoring.server.ts', 'utf8') +
    '\nexport { getRemainingCountByEpisodeId };';
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', compiled)((name) => {
    assert.equal(name, './db.server');
    return pool;
  }, exports);
  const info = await exports.getEpisodeScoringInfo(1);
  const episode = info.get(1);
  assert.deepEqual(episode.eliminatedContestants, [10, 11]);
  assert.deepEqual(episode.eliminationWinners, [11]);
  assert.equal(exports.scorePrediction('active', 10, episode.eliminationWinners, 3), 0);
  assert.equal(exports.scorePrediction('active', 11, episode.eliminationWinners, 3), 3);
  assert.equal(exports.isPredictionCorrect('active', 10, episode.eliminationWinners), false);
  assert.equal(exports.isPredictionCorrect('active', 11, episode.eliminationWinners), true);
  assert.equal(exports.scorePrediction('active', 3, episode.immunityWinners, 1), 1);
  const remaining = await exports.getRemainingCountByEpisodeId(1, info);
  assert.equal(remaining.get(1), 10);
  assert.equal(remaining.get(2), 8);
});
