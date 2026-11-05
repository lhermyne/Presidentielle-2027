import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePolls, candidateKey, forecast, listConfigurations, pollingHistory, selectPolls, settingsFrom, DEFAULT_WEIGHTS, normalizeWeights, sourceShares, SOURCE_IDS, allConfigurations, fitSupport, FIELD_ID, DYNAMIC_SATURATION } from '../model/forecast.mjs';

const effect = value => Math.exp(DYNAMIC_SATURATION * Math.tanh(value / DYNAMIC_SATURATION)) - 1;

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
  wikipedia: { asOf: data.asOf, windows: { '2026-10-19': { anchor: '2026-10-19', signals: { a: { dynamic: 0.6 }, b: { dynamic: -0.4 }, d: { dynamic: 0.1 } } } } },
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
  for (const row of result.rows) assert.ok(Math.abs(row.corrections.barometer) <= row.pollScore * (Math.exp(DYNAMIC_SATURATION) - 1) + 1e-9);
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
  const first = forecast(data, key, { simulations: 6000, uncertainty: 4 });
  const altered = structuredClone(data);
  altered.market.markets = [{ id: 'a', probability: 80 }, { id: 'b', probability: 5 }, { id: 'c', probability: 10 }, { id: 'd', probability: 5 }];
  const second = forecast(altered, key, { simulations: 6000, uncertainty: 4 });
  assert.ok(Object.keys(first.duelShifts).length > 0 && Object.keys(second.duelShifts).length > 0);
  assert.ok(first.rows.find(row => row.id === 'b').winLower > second.rows.find(row => row.id === 'b').winLower);
  assert.notEqual(first.rows.find(row => row.id === 'b').score, second.rows.find(row => row.id === 'b').score);
  assert.notEqual(first.rows.find(row => row.id === 'b').qualification, second.rows.find(row => row.id === 'b').qualification);
  // Avant les simulations, le marché agit sur le centre ; le total reste à 100 %.
  assert.ok(first.rows.find(row => row.id === 'b').center > second.rows.find(row => row.id === 'b').center);
  assert.ok(Math.abs(first.rows.reduce((total, row) => total + row.center, 0) - 100) < 1e-8);
  assert.ok(Math.abs(first.rows.reduce((total, row) => total + row.score, 0) - 100) < 1e-8);
  assert.ok(Math.abs(first.rows.reduce((total, row) => total + row.qualification, 0) - 200) < 1e-8);
  assert.ok(first.rows.every(row => row.winLower <= row.winUpper && row.winUpper <= row.qualification + 1e-8));
  assert.ok(first.marketFusion.effectiveSampleSize > 1000);
});

test('market prices cannot invent a missing runoff or a simulated winner', () => {
  const data = addSignals(dataset(firstRound));
  // Un petit poids évite une majorité dès le premier tour : sans duel sondé, aucun vainqueur n'est inventé.
  const result = forecast(data, key, { weights: { polls: 100, polymarket: 5 }, simulations: 2000 });
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
    assert.ok(result.rows.every(row => row.center > 0));
    assert.ok(Math.abs(result.rows.reduce((total, row) => total + row.center, 0) - 100) < 1e-8);
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
  assert.ok(Math.abs(history[0].scores.a - 30) < 1e-6);
  assert.ok(history[1].scores.a > 30);
});

test('query settings are finite and constrained', () => {
  assert.deepEqual(settingsFrom({ halfLife: 'oops', uncertainty: -1, simulations: 1 }), { halfLife: 7, weights: DEFAULT_WEIGHTS, uncertainty: 2, simulations: 1000 });
});

test('60 per mille with x2 gives about a 12 percent relative boost, not twelve points', () => {
  const data = addSignals(dataset([poll('p', {a: 40, b: 30, c: 20, d: 10})]));
  const result = forecast(data, key, { weights: { polls: 100, barometer: 40 }, simulations: 1000 });
  const row = result.rows.find(row => row.id === 'd');
  assert.ok(Math.abs(row.corrections.barometer - 10 * effect(0.058 * 2)) < 1e-10);
  assert.equal(result.adjustmentLimits.barometerScale, 2);
  assert.ok(row.center < 11.3);
  // A new survey at the same date resets the measurement window.
  data.polls[0].fieldEnd = '2026-10-20';
  data.social.windows['2026-10-20'] = {anchor:'2026-10-20', signals:{a:{score:0,coverage:4},b:{score:0,coverage:4},c:{score:0,coverage:4},d:{score:0,coverage:4}}};
  const reset = forecast(data, key, { weights: { polls: 100, barometer: 40 }, simulations: 1000 });
  assert.ok(reset.rows.every(row => row.corrections.barometer === 0));
  assert.equal(reset.sourceMix.barometer.anchor, '2026-10-20');
});

test('the barometer slider is a direct x0 to x5 multiplier that also takes room in the influence bar', () => {
  const data = addSignals(dataset(firstRound));
  const run = weights => forecast(data, key, { weights, simulations: 1000 });
  const small = result => result.rows.find(row => row.id === 'd').corrections.barometer;
  assert.equal(run({ polls: 100 }).adjustmentLimits.barometerScale, 0);
  assert.ok(run({ polls: 100 }).rows.every(row => row.corrections.barometer === 0));
  const one = run({ polls: 100, barometer: 20 });
  const five = run({ polls: 100, barometer: 100 });
  const fiveAlone = run({ polls: 1, barometer: 100, polymarket: 100 });
  assert.equal(one.adjustmentLimits.barometerScale, 1);
  assert.equal(five.adjustmentLimits.barometerScale, 5);
  assert.equal(fiveAlone.adjustmentLimits.barometerScale, 5);
  assert.ok(small(five) > 4 * small(one) && small(five) < 6 * small(one));
  assert.equal(five.sourceMix.barometer.effective, 50);
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

test('Wikipedia dynamics since the last poll act like the barometer', () => {
  const data = addSignals(dataset(firstRound));
  const result = forecast(data, key, { weights: { polls: 80, wikipedia: 20 }, simulations: 1000 });
  const row = id => result.rows.find(item => item.id === id);
  assert.ok(result.sourceMix.wikipedia.available);
  assert.ok(row('a').corrections.wikipedia > 0);
  assert.ok(row('b').corrections.wikipedia < 0);
  assert.equal(row('c').corrections.wikipedia, 0);
  assert.ok(result.sourceMix.wikipedia.missing.includes('c'));
  for (const item of result.rows) assert.ok(Math.abs(item.corrections.wikipedia) <= item.pollScore * 0.1 + 1e-9);
  assert.ok(Math.abs(row('a').corrections.wikipedia - row('a').pollScore * effect(0.055)) < 1e-9);
  assert.equal(result.adjustmentLimits.wikipediaScale, 1);
  data.wikipedia.asOf = '2026-10-10';
  assert.equal(forecast(data, key, { simulations: 1000 }).sourceMix.wikipedia.available, false);
});

test('the qualification market corrects qualifications, the place markets act before the simulations', () => {
  const data = addSignals(dataset([...firstRound, ...completeDuels()]));
  const stamp = `${data.asOf}T12:00:00Z`;
  const board = prices => ({ capturedAt: stamp, markets: Object.entries(prices).map(([id, probability]) => ({ id, probability })) });
  const settings = { simulations: 6000, uncertainty: 4 };
  data.market = null;
  const plain = forecast(data, key, settings);
  data.marketEvents = { advance: board({ a: 40, b: 30, c: 95, d: 35 }), other: board({ a: 99, b: 1 }) };
  const result = forecast(data, key, settings);
  const boards = Object.fromEntries(result.marketFusion.boards.map(item => [item.id, item]));
  assert.ok(boards.advance.active);
  assert.equal(boards.other, undefined);
  assert.equal(result.marketBonus.boards.length, 0);
  const qualification = (output, id) => output.rows.find(row => row.id === id).qualification;
  assert.ok(qualification(result, 'c') > qualification(plain, 'c'));
  assert.ok(Math.abs(result.rows.reduce((total, row) => total + row.qualification, 0) - 200) < 1e-8);
  assert.ok(result.marketFusion.effectiveSampleSize > 1000);
  assert.equal(forecast(data, key, { ...settings, weights: { polls: 100 } }).marketFusion.active, false);
  // Les places sont comparées au score des sondages, de façon cumulée.
  data.marketEvents = { winner: board({ a: 80, b: 10, c: 5, d: 5 }), second: board({ a: 10, b: 60, c: 20, d: 10 }) };
  const places = forecast(data, key, settings);
  assert.deepEqual(places.marketBonus.boards, ['winner', 'second']);
  assert.ok(places.marketBonus.targets.a > 35);
  assert.ok(places.marketBonus.targets.d < 18);
});

const trueSupport = { a: 40, b: 30, c: 20, d: 10 };
const listPoll = (id, ids) => {
  const total = ids.reduce((sum, candidate) => sum + trueSupport[candidate], 0);
  return poll(id, Object.fromEntries(ids.map(candidate => [candidate, 100 * trueSupport[candidate] / total])));
};

test('all lists are combined into one coherent support, with absent candidates reported pro rata', () => {
  const data = dataset([listPoll('p1', ['a', 'b', 'c']), listPoll('p2', ['b', 'c', 'd']), listPoll('p3', ['a', 'd'])]);
  const { support } = fitSupport(data);
  assert.ok(Math.abs(support.a / support.d - 4) < 1e-3);
  assert.ok(Math.abs(support.b / support.c - 1.5) < 1e-3);
  const full = forecast(data, 'a|b|c|d', { weights: { polls: 100 }, simulations: 1000 });
  assert.equal(full.error, undefined);
  const narrow = forecast(data, 'a|d', { weights: { polls: 100 }, simulations: 1000 });
  assert.ok(Math.abs(narrow.rows.find(row => row.id === 'a').pollScore - 80) < 1e-2);
  assert.equal(narrow.baseline.pollCount, 3);
});

test('the coherent field keeps candidates backed by the ballot or victory markets', () => {
  const data = dataset([listPoll('p1', ['a', 'b', 'c']), listPoll('p2', ['b', 'c', 'd'])]);
  const stamp = `${data.asOf}T12:00:00Z`;
  data.market = { capturedAt: stamp, markets: [{ id: 'a', probability: 40 }, { id: 'd', probability: 0.1 }] };
  data.marketEvents = { ballot: { capturedAt: stamp, markets: [{ id: 'b', probability: 80 }, { id: 'c', probability: 5 }, { id: 'd', probability: 5 }] } };
  const [field] = allConfigurations(data);
  assert.equal(field.id, FIELD_ID);
  assert.deepEqual(field.candidateIds, ['a', 'b']);
  const result = forecast(data, FIELD_ID, { weights: { polls: 100 }, simulations: 1000 });
  assert.ok(Math.abs(result.rows.reduce((total, row) => total + row.pollScore, 0) - 100) < 1e-9);
  assert.deepEqual(pollingHistory(data, FIELD_ID).length, 1);
  data.market = null;
  data.marketEvents = null;
  assert.notEqual(allConfigurations(data)[0].id, FIELD_ID);
});

test('near-zero dynamics have no effect, losses pull down, and strong dynamics are not clipped', () => {
  const data = addSignals(dataset(firstRound));
  const window = data.social.windows['2026-10-19'].signals;
  Object.assign(window, { a: { score: 1.5, coverage: 4 }, b: { score: -40, coverage: 4 }, c: { score: 400, coverage: 4 }, d: { score: -1, coverage: 4 } });
  const result = forecast(data, key, { weights: { polls: 100, barometer: 100 }, simulations: 1000 });
  const row = id => result.rows.find(item => item.id === id);
  assert.equal(row('a').corrections.barometer, 0);
  assert.equal(row('d').corrections.barometer, 0);
  assert.ok(row('b').corrections.barometer < 0);
  assert.ok(row('c').corrections.barometer > row('c').pollScore * 1.5);
});

test('an extra candidate splits its own political bloc instead of diluting every other camp', () => {
  const data = dataset([poll('p1', { a: 40, b: 60 }), poll('p2', { a: 40, b: 40, c: 20 })]);
  data.candidates = [{ id: 'a', name: 'a', party: 'RN', family: 'RN' }, { id: 'b', name: 'b', party: 'PS', family: 'PS' }, { id: 'c', name: 'c', party: 'LE', family: 'LE' }];
  const result = forecast(data, 'a|b|c', { weights: { polls: 100 }, simulations: 1000 });
  const narrow = forecast(data, 'a|b', { weights: { polls: 100 }, simulations: 1000 });
  const score = (output, id) => output.rows.find(row => row.id === id).pollScore;
  assert.ok(Math.abs(score(result, 'a') - 40) < 1e-6);
  assert.ok(Math.abs(score(narrow, 'a') - 40) < 1e-6);
  assert.ok(Math.abs(score(result, 'b') - 40) < 1e-3);
  assert.ok(Math.abs(score(result, 'c') - 20) < 1e-3);
});

test('a market price above the poll score gives a bonus, below it a malus', () => {
  const data = dataset(firstRound);
  data.market = { capturedAt: `${data.asOf}T12:00:00Z`, markets: [{ id: 'a', probability: 45 }, { id: 'b', probability: 35 }, { id: 'c', probability: 15 }, { id: 'd', probability: 5 }] };
  const result = forecast(data, key, { weights: { polls: 100, polymarket: 50 }, simulations: 2000 });
  const row = id => result.rows.find(item => item.id === id);
  assert.ok(row('a').corrections.polymarket > 0 && row('a').center > row('a').pollScore);
  assert.ok(row('a').center < 45);
  assert.ok(row('d').corrections.polymarket < 0 && row('d').center < row('d').pollScore);
});

test('Polymarket acts before the simulations: backed candidates gain, the polls-only scenario stays untouched', () => {
  const data = dataset([...firstRound, ...completeDuels()]);
  const stamp = `${data.asOf}T12:00:00Z`;
  data.market = { capturedAt: stamp, markets: [{ id: 'a', probability: 40 }, { id: 'b', probability: 10 }, { id: 'c', probability: 5 }, { id: 'd', probability: 45 }] };
  const backed = forecast(data, key, { weights: { polls: 100, polymarket: 50 }, simulations: 4000 });
  const row = id => backed.rows.find(item => item.id === id);
  assert.ok(row('d').corrections.polymarket > 0);
  assert.ok(row('d').center > row('d').pollScore);
  assert.ok(row('d').score > 18);
  assert.ok(backed.marketBonus.targets.d > row('d').pollScore);
  const pollsOnly = forecast(data, key, { weights: { polls: 100 }, simulations: 4000 });
  assert.ok(pollsOnly.rows.every(item => item.corrections.polymarket === 0));
  assert.equal(pollsOnly.marketBonus.boards.length, 0);
  const stronger = forecast(data, key, { weights: { polls: 100, polymarket: 100 }, simulations: 4000 });
  assert.ok(stronger.rows.find(item => item.id === 'd').corrections.polymarket > row('d').corrections.polymarket);
});

test('candidates of one party report fully to their titular, in polls and in markets', () => {
  const data = dataset([poll('p1', { 'marine-le-pen': 30, 'jordan-bardella': 5, 'eric-zemmour': 5, 'sarah-knafo': 3, b: 57 }), poll('p2', { 'jordan-bardella': 36, b: 64 }, { round: 2 })]);
  data.candidates = ['marine-le-pen', 'jordan-bardella', 'eric-zemmour', 'sarah-knafo', 'b'].map(id => ({ id, name: id, family: id }));
  const stamp = `${data.asOf}T12:00:00Z`;
  data.market = { capturedAt: stamp, markets: [{ id: 'marine-le-pen', probability: 40 }, { id: 'jordan-bardella', probability: 5 }, { id: 'b', probability: 20 }] };
  const [list] = listConfigurations(data);
  assert.deepEqual(list.candidateIds, ['b', 'eric-zemmour', 'marine-le-pen']);
  const result = forecast(data, list.id, { weights: { polls: 100 }, simulations: 1000 });
  assert.ok(Math.abs(result.rows.find(row => row.id === 'marine-le-pen').pollScore - 35) < 1e-3);
  assert.ok(Math.abs(result.rows.find(row => row.id === 'eric-zemmour').pollScore - 8) < 1e-3);
  assert.ok(result.pairs.some(pair => pair.key === 'b|marine-le-pen' && pair.estimate) || !result.pairs.length);
  assert.equal(result.sourceMix.polymarket.prices['marine-le-pen'], 45);
});

test('the victory market moves the duels: a favourite the market doubts loses ground, without it the polls decide', () => {
  const data = dataset([poll('p1', { a: 45, b: 35, c: 20 }), poll('duel', { a: 70, b: 30 }, { round: 2 })]);
  data.market = { capturedAt: `${data.asOf}T12:00:00Z`, markets: [{ id: 'a', probability: 40 }, { id: 'b', probability: 55 }, { id: 'c', probability: 5 }] };
  const run = weights => forecast(data, 'a|b|c', { weights, simulations: 4000 });
  const row = (result, id) => result.rows.find(item => item.id === id);
  const pollsOnly = run({ polls: 100 });
  assert.deepEqual(pollsOnly.duelShifts, {});
  assert.ok(row(pollsOnly, 'a').winLower > 99);
  const market = run({ polls: 100, polymarket: 20 });
  assert.ok(market.duelShifts['a|b'] < 0);
  assert.ok(row(market, 'a').winLower < row(pollsOnly, 'a').winLower);
  assert.ok(row(market, 'b').winLower > row(pollsOnly, 'b').winLower);
  assert.ok(row(market, 'a').runoff.score < row(pollsOnly, 'a').runoff.score);
  // Le score affiché du duel reste celui des sondages.
  assert.equal(market.pairs.find(pair => pair.key === 'a|b').estimate.scores.a, pollsOnly.pairs.find(pair => pair.key === 'a|b').estimate.scores.a);
});

test('Polymarket pulls a score towards the market without ever exceeding its price', () => {
  const data = dataset(firstRound);
  data.market = { capturedAt: `${data.asOf}T12:00:00Z`, markets: [{ id: 'a', probability: 45 }, { id: 'b', probability: 10 }, { id: 'c', probability: 5 }, { id: 'd', probability: 2 }] };
  const center = (weights, id) => forecast(data, key, { weights, simulations: 1000 }).rows.find(row => row.id === id).center;
  const low = center({ polls: 100, polymarket: 20 }, 'a');
  const high = center({ polls: 100, polymarket: 100 }, 'a');
  const extreme = center({ polls: 1, polymarket: 100 }, 'a');
  assert.ok(35 < low && low < high && high <= extreme);
  assert.ok(extreme <= 45 + 1e-9);
  // Un candidat mieux placé dans les sondages que sur le marché descend, sans être bloqué par ce plafond.
  assert.ok(center({ polls: 1, polymarket: 100 }, 'c') < 22);
});

test('uncertainty stays between 2 and 6 points, is proportional to the score, and rewards steady dynamics', () => {
  const days = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'];
  const series = values => Object.fromEntries(days.map((day, index) => [day, values[index]]));
  const data = dataset(firstRound);
  data.history = { polymarket: {
    a: series([10, 11, 12, 13, 14, 15, 16]),
    b: series([10, 30, 8, 35, 6, 40, 10]),
    c: series([10, 12, 11, 13, 12, 14, 13]),
    d: series([10, 10, 11, 11, 12, 12, 13]),
  } };
  const run = uncertainty => forecast(data, key, { weights: { polls: 100 }, uncertainty, simulations: 2000 });
  const row = (result, id) => result.rows.find(item => item.id === id);
  const result = run(4);
  assert.ok(row(result, 'a').uncertainty.percent < row(result, 'b').uncertainty.percent);
  assert.ok(row(result, 'a').uncertainty.multiplier < 1 && row(result, 'b').uncertainty.multiplier > 1);
  for (const uncertainty of [2, 4, 6]) {
    for (const item of run(uncertainty).rows) {
      assert.ok(item.uncertainty.points >= 2 && item.uncertainty.points <= 6);
      assert.ok(Math.abs(item.uncertainty.percent - item.uncertainty.points * 4) < 1e-9);
    }
  }
  assert.equal(settingsFrom({ uncertainty: 1 }).uncertainty, 2);
  assert.equal(settingsFrom({ uncertainty: 9 }).uncertainty, 6);
  assert.equal(settingsFrom().uncertainty, 4);
  const width = (output, id) => row(output, id).upper - row(output, id).lower;
  assert.ok(width(run(6), 'a') > width(run(2), 'a'));
});

test('each probable duel exposes the projected score of both finalists', () => {
  const data = dataset([poll('p1', { a: 45, b: 35, c: 20 }), poll('duel', { a: 60, b: 40 }, { round: 2 })]);
  const result = forecast(data, 'a|b|c', { weights: { polls: 100 }, simulations: 4000 });
  const pair = result.pairs.find(item => item.key === 'a|b');
  assert.ok(Math.abs(pair.projection.scores.a + pair.projection.scores.b - 100) < 1e-9);
  assert.ok(Math.abs(pair.projection.scores.a - 60) < 1);
  assert.ok(pair.projection.lower.a < 60 && pair.projection.upper.a > 60);
  const undocumented = result.pairs.find(item => item.key !== 'a|b');
  if (undocumented) assert.equal(undocumented.projection, null);
});
