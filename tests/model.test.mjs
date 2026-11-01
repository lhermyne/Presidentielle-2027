import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePolls, candidateKey, forecast, listConfigurations, pollingHistory, selectPolls, settingsFrom, DEFAULT_WEIGHTS, normalizeWeights, sourceShares, SOURCE_IDS } from '../model/forecast.mjs';

const poll = (id, scores, extra = {}) => ({ id, institute: 'Institut A', fieldStart: '2026-10-17', fieldEnd: '2026-10-19', sampleSize: 1000, round: 1, scores, ...extra });
const dataset = (polls = []) => ({ asOf: '2026-10-20', candidates: ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, family: id })), polls, social: { asOf: '2026-10-20', signals: {} }, market: null });
const firstRound = [poll('p1', { a: 35, b: 25, c: 22, d: 18 })];
const key = candidateKey(['a', 'b', 'c', 'd']);

test('candidate sets are isolated and future polls are excluded', () => {
  const data = dataset([...firstRound, poll('other', { a: 70, b: 30 }), poll('future', { a: 100, b: 0 }, { fieldEnd: '2026-10-21' })]);
  assert.equal(listConfigurations(data).length, 2);
  assert.equal(selectPolls(data, key).length, 1);
  assert.equal(aggregatePolls(selectPolls(data, key), key.split('|'), data.asOf).scores.a, 35);
});

test('alternative configurations from one survey do not multiply its weight', () => {
  const a = poll('p1', { a: 40, b: 60 });
  const b = poll('p2', { a: 60, b: 40 });
  const once = aggregatePolls([a, b], ['a', 'b'], '2026-10-20');
  const repeated = aggregatePolls([a, a, a, b], ['a', 'b'], '2026-10-20');
  assert.deepEqual(once.scores, repeated.scores);
  assert.equal(repeated.pollCount, 2);
});

test('simulation is deterministic and probability identities hold', () => {
  const data = dataset(firstRound);
  const result = forecast(data, key, { simulations: 4000 });
  assert.deepEqual(result, forecast(data, key, { simulations: 4000 }));
  assert.ok(Math.abs(result.rows.reduce((total, row) => total + row.score, 0) - 100) < 1e-8);
  assert.ok(Math.abs(result.rows.reduce((total, row) => total + row.qualification, 0) - 200) < 1e-8);
  for (const row of result.rows) {
    assert.ok(row.lower >= 0 && row.upper <= 100 && row.lower <= row.upper);
    assert.ok(row.winLower <= row.winUpper && row.winUpper <= row.qualification + 1e-9);
  }
  assert.ok(result.unresolved > 90);
  assert.ok(Math.abs(result.rows.reduce((total, row) => total + row.winLower, 0) - (100 - result.unresolved)) < 1e-8);
});

test('fully documented second-round pairs resolve all simulations', () => {
  const duels = [];
  const ids = ['a', 'b', 'c', 'd'];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) duels.push(poll(`duel-${i}-${j}`, { [ids[i]]: 52, [ids[j]]: 48 }, { round: 2 }));
  const result = forecast(dataset([...firstRound, ...duels]), key, { simulations: 3000 });
  assert.equal(result.unresolved, 0);
  assert.ok(Math.abs(result.rows.reduce((total, row) => total + row.winLower, 0) - 100) < 1e-8);
  assert.ok(result.rows.every(row => row.winUpper === row.winLower));
});

const completeDuels = () => {
  const ids = ['a', 'b', 'c', 'd'];
  return ids.flatMap((id, i) => ids.slice(i + 1).map(other => poll(`duel-${id}-${other}`, { [id]: 52, [other]: 48 }, { round: 2 })));
};
const addSignals = data => ({ ...data,
  social: { asOf: data.asOf, windows: { '2026-10-19': { anchor: '2026-10-19', signals: { a: {score:1,coverage:4}, b: {score:-2,coverage:4}, c: {score:0,coverage:2}, d: {score:60,coverage:4} } } }, signals: { a: { barometerScore: 1, barometerCoverage: 4 }, b: { barometerScore: -2, barometerCoverage: 4 }, c: { barometerScore: 0, barometerCoverage: 2 }, d: { barometerScore: 100, barometerCoverage: 4 } } },
  market: { capturedAt: `${data.asOf}T12:00:00Z`, markets: [{ id: 'a', probability: 5 }, { id: 'b', probability: 80 }, { id: 'c', probability: 10 }, { id: 'd', probability: 5 }] },
  trends: { asOf: data.asOf, interest: { a: 100, b: 500 } },
  wikipedia: { asOf: data.asOf, momentum: { a: 0.6, b: -0.4, d: 0.1 } },
});

test('independent sliders become shares of 100 percent and polls keep at least 1', () => {
  assert.deepEqual(normalizeWeights({ polls: 0, polymarket: 150, wikipedia: -3, trends: NaN }), { polls: 1, barometer: 0, polymarket: 100, wikipedia: 0, trends: 0 });
  const shares = sourceShares({ polls: 100, polymarket: 100 });
  assert.equal(shares.polls, 50);
  assert.equal(shares.polymarket, 50);
  assert.equal(sourceShares({ polls: 100 }).polls, 100);
  for (const weights of [DEFAULT_WEIGHTS, { polls: 1, barometer: 100, polymarket: 37 }, { polls: 100 }]) {
    const total = Object.values(sourceShares(weights)).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 100) < 1e-9);
  }
});

test('100 percent polls with boost disabled excludes every complementary signal from outcomes', () => {
  const plain = dataset([...firstRound, ...completeDuels()]);
  const settings = { weights: { polls: 100 }, simulations: 3000 };
  assert.deepEqual(forecast(plain, key, settings).rows, forecast(addSignals(plain), key, settings).rows);
});

test('the barometer is active by default as a bounded correction, never a vote-share ranking', () => {
  const data = addSignals(dataset([poll('small', { a: 40, b: 30, c: 28, d: 2 })]));
  const result = forecast(data, key, { simulations: 2000 });
  const small = result.rows.find(row => row.id === 'd');
  assert.ok(small.corrections.barometer > 0);
  assert.ok(small.center < 5 && small.score < 5);
  assert.notEqual(result.rows[0].id, 'd');
  for (const row of result.rows) assert.ok(Math.abs(row.corrections.barometer) <= row.pollScore * result.adjustmentLimits.relative / 100 + 1e-9);
  const extreme = forecast(data, key, { weights: { polls: 1, barometer: 100 }, simulations: 1000 });
  assert.ok(extreme.rows.find(row => row.id === 'd').center < 10);
});

test('missing, stale and future social signals cannot create a correction', () => {
  const data = addSignals(dataset(firstRound));
  delete data.social.windows['2026-10-19'].signals.d;
  assert.equal(forecast(data, key, { simulations: 1000 }).rows.find(row => row.id === 'd').corrections.barometer, 0);
  for (const asOf of ['2026-10-10', '2026-10-21']) {
    data.social.asOf = asOf;
    const result = forecast(data, key, { simulations: 1000 });
    assert.equal(result.sourceMix.barometer.available, false);
    assert.ok(result.rows.every(row => row.corrections.barometer === 0));
  }
});

test('Google trend attention affects the first round without assigning zero to absent candidates', () => {
  const data = addSignals(dataset(firstRound));
  const result = forecast(data, key, { simulations: 1000 });
  assert.ok(result.sourceMix.trends.available);
  assert.ok(result.rows.find(row => row.id === 'a').corrections.trends < 0);
  assert.ok(result.rows.find(row => row.id === 'b').corrections.trends > 0);
  assert.equal(result.rows.find(row => row.id === 'c').corrections.trends, 0);
  assert.ok(result.sourceMix.trends.missing.includes('c'));
  data.trends.interest = { a: 100 };
  assert.equal(forecast(data, key, { simulations: 1000 }).sourceMix.trends.effective, 0);
});

test('market winner prices affect documented trajectories and propagate to scores and qualification', () => {
  const data = addSignals(dataset([...firstRound, ...completeDuels()]));
  const first = forecast(data, key, { simulations: 6000 });
  const altered = structuredClone(data);
  altered.market.markets = [{ id: 'a', probability: 80 }, { id: 'b', probability: 5 }, { id: 'c', probability: 10 }, { id: 'd', probability: 5 }];
  const second = forecast(altered, key, { simulations: 6000 });
  assert.ok(first.marketFusion.active && second.marketFusion.active);
  assert.ok(first.rows.find(row => row.id === 'b').winLower > second.rows.find(row => row.id === 'b').winLower);
  assert.notEqual(first.rows.find(row => row.id === 'b').score, second.rows.find(row => row.id === 'b').score);
  assert.notEqual(first.rows.find(row => row.id === 'b').qualification, second.rows.find(row => row.id === 'b').qualification);
  // These are weights on complete paths, never a price added to a vote share.
  assert.deepEqual(first.rows.map(row => [row.id, row.center]).sort(), second.rows.map(row => [row.id, row.center]).sort());
  assert.ok(Math.abs(first.rows.reduce((total, row) => total + row.score, 0) - 100) < 1e-8);
  assert.ok(Math.abs(first.rows.reduce((total, row) => total + row.qualification, 0) - 200) < 1e-8);
  assert.ok(first.rows.every(row => row.winLower <= row.winUpper && row.winUpper <= row.qualification + 1e-8));
  assert.ok(first.marketFusion.effectiveSampleSize > 1000);
});

test('market prices cannot invent a missing runoff or a simulated winner', () => {
  const data = addSignals(dataset(firstRound));
  const result = forecast(data, key, { simulations: 2000 });
  assert.equal(result.marketFusion.active, false);
  assert.ok(result.unresolved > 90);
  assert.ok(result.rows.every(row => row.winLower === 0));
});

test('polls stay the base: their weight never drops below 1 and signals only adjust it', () => {
  const data = addSignals(dataset(firstRound));
  for (const source of ['polymarket', 'wikipedia', 'trends', 'barometer']) {
    const result = forecast(data, key, { weights: { polls: 0, [source]: 100 }, simulations: 1000 });
    assert.equal(result.settings.weights.polls, 1);
    assert.ok(!result.error);
    assert.ok(result.sourceMix.polls.effective > 0);
    for (const row of result.rows) assert.ok(Math.abs(row.center - row.pollScore) <= row.pollScore * 1.5 + 1);
  }
});

test('invalid totals and non-finite scores cannot enter a forecast', () => {
  const data = dataset([poll('invalid', { a: 90, b: 60 }), poll('nan', { a: NaN, b: 60 })]);
  assert.equal(listConfigurations(data).length, 0);
  assert.ok(forecast(data).error);
});

test('a first-round majority is counted as a victory without a second-round poll', () => {
  const result = forecast(dataset([poll('p1', { a: 99, b: 1 })]), 'a|b', { simulations: 1000, uncertainty: 2 });
  assert.equal(result.unresolved, 0);
  assert.equal(result.rows[0].winLower, 100);
});

test('historical polling averages do not use later observations', () => {
  const data = dataset([poll('early', { a: 30, b: 70 }, { fieldEnd: '2026-10-01' }), poll('late', { a: 60, b: 40 })]);
  const history = pollingHistory(data, 'a|b');
  assert.equal(history[0].scores.a, 30);
  assert.ok(history[1].scores.a > 30);
});

test('query settings are finite and constrained', () => {
  assert.deepEqual(settingsFrom({ halfLife: 'oops', uncertainty: -1, simulations: 1 }), { halfLife: 21, weights: DEFAULT_WEIGHTS, uncertainty: 2, simulations: 1000 });
});

test('60 per mille with x2 gives a 12 percent relative boost, not twelve points', () => {
  const data = addSignals(dataset([poll('p', {a: 40, b: 30, c: 20, d: 10})]));
  const result = forecast(data, key, { weights: { polls: 80, barometer: 20 }, simulations: 1000 });
  const row = result.rows.find(row => row.id === 'd');
  assert.ok(Math.abs(row.corrections.barometer - 1.2) < 1e-10);
  assert.equal(result.adjustmentLimits.barometerScale, 2);
  assert.ok(row.center < 11.3);
  // A new survey at the same date resets the measurement window.
  data.polls[0].fieldEnd = '2026-10-20';
  data.social.windows['2026-10-20'] = {anchor:'2026-10-20', signals:{a:{score:0,coverage:4},b:{score:0,coverage:4},c:{score:0,coverage:4},d:{score:0,coverage:4}}};
  const reset = forecast(data, key, { weights: { polls: 80, barometer: 20 }, simulations: 1000 });
  assert.ok(reset.rows.every(row => row.corrections.barometer === 0));
  assert.equal(reset.sourceMix.barometer.anchor, '2026-10-20');
});

test('the barometer share sets its multiplier: 30 percent gives x3 and 50 percent gives x5', () => {
  const data = addSignals(dataset(firstRound));
  const run = weights => forecast(data, key, { weights, simulations: 1000 });
  const small = result => result.rows.find(row => row.id === 'd').corrections.barometer;
  assert.equal(run({ polls: 100 }).adjustmentLimits.barometerScale, 0);
  assert.ok(run({ polls: 100 }).rows.every(row => row.corrections.barometer === 0));
  const one = run({ polls: 90, barometer: 10 });
  const five = run({ polls: 100, barometer: 100 });
  assert.ok(Math.abs(one.adjustmentLimits.barometerScale - 1) < 1e-9);
  assert.ok(Math.abs(five.adjustmentLimits.barometerScale - 5) < 1e-9);
  assert.ok(Math.abs(small(five) - 5 * small(one)) < 1e-9);
});

test('an unavailable source is excluded from the shares instead of counting as zero', () => {
  const data = addSignals(dataset([...firstRound, ...completeDuels()]));
  const offline = structuredClone(data);
  offline.market = null;
  offline.trends = null;
  const online = forecast(data, key, { simulations: 1000 });
  const result = forecast(offline, key, { simulations: 1000 });
  assert.equal(result.sourceMix.polymarket.effective, 0);
  assert.equal(result.sourceMix.trends.effective, 0);
  assert.ok(result.sourceMix.polls.effective > online.sourceMix.polls.effective);
  const total = Object.values(result.sourceMix).reduce((sum, source) => sum + source.effective, 0);
  assert.ok(Math.abs(total - 100) < 1e-9);
});

test('second-round scores come from documented duel polls only', () => {
  const documented = forecast(dataset([...firstRound, ...completeDuels()]), key, { simulations: 3000 });
  const leader = documented.rows.find(row => row.id === 'a');
  assert.ok(leader.runoff.score > 45 && leader.runoff.score < 60);
  assert.ok(leader.runoff.lower <= leader.runoff.score && leader.runoff.score <= leader.runoff.upper);
  assert.ok(Math.abs(leader.runoff.coverage - 100) < 1e-9);
  const undocumented = forecast(dataset(firstRound), key, { simulations: 1000 });
  assert.ok(undocumented.rows.every(row => row.runoff === null));
});

test('Wikipedia momentum is a relative boost like the barometer and absent series stay uncorrected', () => {
  const data = addSignals(dataset(firstRound));
  const result = forecast(data, key, { weights: { polls: 80, wikipedia: 20 }, simulations: 1000 });
  const row = id => result.rows.find(item => item.id === id);
  assert.ok(result.sourceMix.wikipedia.available);
  assert.ok(row('a').corrections.wikipedia > 0);
  assert.ok(row('b').corrections.wikipedia < 0);
  assert.equal(row('c').corrections.wikipedia, 0);
  assert.ok(result.sourceMix.wikipedia.missing.includes('c'));
  for (const item of result.rows) assert.ok(Math.abs(item.corrections.wikipedia) <= item.pollScore * 0.2 + 1e-9);
  data.wikipedia.asOf = '2026-10-10';
  assert.equal(forecast(data, key, { simulations: 1000 }).sourceMix.wikipedia.available, false);
});
