import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePolls, candidateKey, forecast, listConfigurations, pollingHistory, selectPolls, settingsFrom, DEFAULT_WEIGHTS, normalizeWeights, redistributeWeights, SOURCE_IDS } from '../model/forecast.mjs';

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
});

test('sliders always sum to exactly 100 and allow source extremes', () => {
  let weights = DEFAULT_WEIGHTS;
  for (let value = 0; value <= 100; value++) for (const id of SOURCE_IDS) {
    weights = redistributeWeights(weights, id, value);
    assert.equal(weights[id], value);
    assert.equal(Object.values(weights).reduce((a, b) => a + b), 100);
    assert.ok(Object.values(weights).every(Number.isInteger));
  }
  assert.deepEqual(normalizeWeights({ polls: NaN, barometer: -10 }), DEFAULT_WEIGHTS);
  assert.deepEqual(redistributeWeights({ polls: 100 }, 'polls', 0), { polymarket: 74, trends: 26, polls: 0 });
});

test('100 percent polls with boost disabled excludes every complementary signal from outcomes', () => {
  const plain = dataset([...firstRound, ...completeDuels()]);
  const settings = { weights: { polls: 100 }, barometerMultiplier: 0, simulations: 3000 };
  assert.deepEqual(forecast(plain, key, settings).rows, forecast(addSignals(plain), key, settings).rows);
});

test('the barometer is active by default as a bounded correction, never a vote-share ranking', () => {
  const data = addSignals(dataset([poll('small', { a: 40, b: 30, c: 28, d: 2 })]));
  const result = forecast(data, key, { simulations: 2000 });
  const small = result.rows.find(row => row.id === 'd');
  assert.ok(small.corrections.barometer > 0);
  assert.ok(small.center < 5 && small.score < 5);
  assert.notEqual(result.rows[0].id, 'd');
  for (const row of result.rows) assert.ok(Math.abs(row.corrections.barometer) <= row.pollScore * result.adjustmentLimits.barometerRelative / 100 + 1e-9);
  const extreme = forecast(data, key, { weights: { polls: 100 }, barometerMultiplier: 5, simulations: 1000 });
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

test('source-only attention or speculation does not fabricate electoral scores', () => {
  const data = addSignals(dataset(firstRound));
  for (const source of ['polymarket', 'trends']) {
    const result = forecast(data, key, { weights: { [source]: 100 }, simulations: 1000 });
    assert.ok(result.error);
    assert.equal(result.rows.length, 0);
    assert.equal(result.sourceMix[source].requested, 100);
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
  assert.deepEqual(settingsFrom({ halfLife: 'oops', uncertainty: -1, simulations: 1 }), { halfLife: 21, weights: DEFAULT_WEIGHTS, barometerMultiplier: 3, uncertainty: 2, simulations: 1000 });
});

test('60 per mille with x2 gives a 12 percent relative boost, not twelve points', () => {
  const data = addSignals(dataset([poll('p', {a: 40, b: 30, c: 20, d: 10})]));
  const result = forecast(data, key, { weights: { polls: 100 }, barometerMultiplier: 2, simulations: 1000 });
  const row = result.rows.find(row => row.id === 'd');
  assert.ok(Math.abs(row.corrections.barometer - 1.2) < 1e-10);
  assert.equal(result.adjustmentLimits.barometerScale, 2);
  assert.ok(row.center < 11.3);
  // A new survey at the same date resets the measurement window.
  data.polls[0].fieldEnd = '2026-10-20';
  data.social.windows['2026-10-20'] = {anchor:'2026-10-20', signals:{a:{score:0,coverage:4},b:{score:0,coverage:4},c:{score:0,coverage:4},d:{score:0,coverage:4}}};
  const reset = forecast(data, key, { weights: { polls:100 }, simulations:1000 });
  assert.ok(reset.rows.every(row => row.corrections.barometer === 0));
  assert.equal(reset.sourceMix.barometer.anchor, '2026-10-20');
});

test('the boost slider accepts zero through five, defaults to three and scales the same window', () => {
  const data = addSignals(dataset(firstRound));
  assert.equal(settingsFrom().barometerMultiplier, 3);
  assert.equal(settingsFrom({barometerMultiplier:999}).barometerMultiplier, 5);
  assert.equal(settingsFrom({barometerMultiplier:-1}).barometerMultiplier, 0);
  const settings = {weights:{polls:100},simulations:1000};
  const zero = forecast(data,key,{...settings,barometerMultiplier:0});
  assert.ok(zero.rows.every(row=>row.corrections.barometer===0));
  const one = forecast(data,key,{...settings,barometerMultiplier:1});
  const five = forecast(data,key,{...settings,barometerMultiplier:5});
  const small = result=>result.rows.find(row=>row.id==='d').corrections.barometer;
  assert.ok(Math.abs(small(five)-5*small(one))<1e-9);
});

test('barometer multiplication is independent of weights and source outages', () => {
  const data = addSignals(dataset([...firstRound,...completeDuels()]));
  const settings = {simulations:1000,barometerMultiplier:3};
  const pollingOnly = forecast(data,key,{...settings,weights:{polls:100}});
  const otherMix = forecast(data,key,{...settings,weights:{polls:40,polymarket:50,trends:10}});
  const unavailable = structuredClone(data);unavailable.market=null;unavailable.trends=null;
  const offline = forecast(unavailable,key,settings);
  const corrections = result => result.rows.map(row=>[row.id,row.corrections.barometer]).sort();
  assert.deepEqual(corrections(pollingOnly),corrections(otherMix));
  assert.deepEqual(corrections(pollingOnly),corrections(offline));
  assert.ok(pollingOnly.rows.find(row=>row.id==='d').corrections.barometer>0);
  assert.equal(pollingOnly.adjustmentLimits.barometerScale,3);
  assert.deepEqual(settingsFrom({...settings,barometerMultiplier:0}).weights,settingsFrom({...settings,barometerMultiplier:5}).weights);
  assert.equal(Object.values(otherMix.settings.weights).reduce((a,b)=>a+b),100);
  assert.ok(!Object.hasOwn(otherMix.settings.weights,'barometer'));
});

test('old four-source settings migrate to a three-source budget without affecting the multiplier', () => {
  const settings=settingsFrom({weights:{polls:55,barometer:25,polymarket:15,trends:5},barometerMultiplier:4});
  assert.deepEqual(settings.weights,{polls:73,polymarket:20,trends:7});
  assert.equal(settings.barometerMultiplier,4);
  assert.deepEqual(redistributeWeights(settings.weights,'barometer',100),settings.weights);
});
