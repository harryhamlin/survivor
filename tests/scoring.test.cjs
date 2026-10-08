const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const ts = require('typescript');

function loadScoring(pool = {}) {
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
  return exports;
}

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
  const exports = loadScoring(pool);
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

const contestant = (id, eliminated = false, finalPlacement = null) => ({ id, eliminated, finalPlacement });
const draft = (playerId, contestantId, isUltimatePick = false) => ({ playerId, contestantId, isUltimatePick });
const episode = (overrides = {}) => ({
  id: 1, episodeNumber: 1, picksOpen: true, hasResults: false,
  immunityType: 'individual', eliminationStatus: 'pending', immunityStatus: 'pending',
  eliminatedContestants: [], eliminationWinners: [], immunityWinners: [], ...overrides,
});

test('maximum projects all remaining rounds and only surviving draft picks', () => {
  const { calculateMaxPossibleScores } = loadScoring();
  const roster = Array.from({ length: 6 }, (_, i) => contestant(i + 1));
  const scores = calculateMaxPossibleScores([1, 2], roster,
    [draft(1, 1, true), draft(1, 2), draft(1, 3)], [], [], 3, false);
  // Weekly rounds at 6, 5, and 4 contestants: 5 + 5 + 4; Final 3: 16.
  assert.equal(scores.get(1), 30);
  assert.equal(scores.get(2), 14);
});

test('recorded special departures reduce future rounds but award no points', () => {
  const { calculateMaxPossibleScores } = loadScoring();
  const roster = Array.from({ length: 6 }, (_, i) => contestant(i + 1, i < 2));
  const scores = calculateMaxPossibleScores([1, 2], roster,
    [draft(1, 3, true), draft(1, 1), draft(2, 3, true), draft(2, 1)],
    [
      { playerId: 1, episodeId: 1, eliminationPickId: 1, immunityPickId: null },
      { playerId: 2, episodeId: 1, eliminationPickId: 2, immunityPickId: null },
    ], [episode({ picksOpen: false, hasResults: true, eliminatedContestants: [1, 2],
      eliminationWinners: [2], eliminationStatus: 'active', immunityStatus: 'void' })], 3, false);
  assert.equal(scores.get(1), 12); // Living ultimate: 8, one future round: 4.
  assert.equal(scores.get(2), 14); // Legitimate boot adds 2.
});

test('locked pending picks respect known outcomes and missed deadlines', () => {
  const { calculateMaxPossibleScores } = loadScoring();
  const roster = [contestant(1, true), contestant(2), contestant(3), contestant(4)];
  const scores = calculateMaxPossibleScores([1, 2, 3], roster, [], [
    { playerId: 1, episodeId: 1, eliminationPickId: 1, immunityPickId: 2 },
    { playerId: 2, episodeId: 1, eliminationPickId: 3, immunityPickId: 3 },
  ], [episode({ picksOpen: false, hasResults: true,
    eliminatedContestants: [1], eliminationWinners: [1], immunityWinners: [2] })], 3, false);
  assert.equal(scores.get(1), 4);
  assert.equal(scores.get(2), 0);
  assert.equal(scores.get(3), 0);
});

test('entered tribe rounds use one immunity point and do not double-count projected rounds', () => {
  const { calculateMaxPossibleScores } = loadScoring();
  const roster = Array.from({ length: 5 }, (_, i) => contestant(i + 1));
  const scores = calculateMaxPossibleScores([1], roster, [], [],
    [episode({ immunityType: 'tribe' })], 3, false);
  assert.equal(scores.get(1), 7); // Tribe round: 2 + 1; individual round: 1 + 3.
});

test('known finalists constrain available slots and a completed season adds no potential', () => {
  const { calculateMaxPossibleScores } = loadScoring();
  const roster = [contestant(1, false, 1), contestant(2, false, 2),
    contestant(3), contestant(4), contestant(5)];
  const drafts = [draft(1, 3, true), draft(1, 4), draft(1, 5), draft(2, 1, true), draft(2, 2)];
  assert.equal(calculateMaxPossibleScores([1], roster, drafts, [], [], 3, false).get(1), 13);
  assert.equal(calculateMaxPossibleScores([1, 2], roster, drafts, [], [], 3, true).get(1), 0);
  assert.equal(calculateMaxPossibleScores([1, 2], roster, drafts, [], [], 3, true).get(2), 12);
});
