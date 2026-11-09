import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregatePolls, candidateKey, forecast, listConfigurations, pollingHistory, selectPolls, settingsFrom, DEFAULT_WEIGHTS, normalizeWeights, sourceShares, SOURCE_IDS, allConfigurations, fitSupport, FIELD_ID, DYNAMIC_SATURATION, HORIZON_SPREAD, horizonSpread } from '../model/forecast.mjs';
import { transferScore } from '../model/transfers.mjs';

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
  // Google Trends, jamais validé, est à 0 par défaut : le test l'active explicitement.
  assert.equal(DEFAULT_WEIGHTS.trends, 0);
  const result = forecast(data, key, { weights: { ...DEFAULT_WEIGHTS, trends: 10 }, simulations: 1000 });
  assert.ok(result.sourceMix.trends.available);
  assert.ok(result.rows.find(row => row.id === 'a').corrections.trends < 0);
  assert.ok(result.rows.find(row => row.id === 'b').corrections.trends > 0);
  assert.equal(result.rows.find(row => row.id === 'c').corrections.trends, 0);
  assert.ok(result.sourceMix.trends.missing.includes('c'));
  data.trends.interest = { a: 100 };
  assert.equal(forecast(data, key, { simulations: 1000 }).sourceMix.trends.effective, 0);
});

test('market winner prices reweight documented trajectories and propagate to scores and qualification', () => {
  const data = addSignals(dataset([...firstRound, ...completeDuels()]));
  const first = forecast(data, key, { simulations: 6000, uncertainty: 4 });
  const altered = structuredClone(data);
  altered.market.markets = [{ id: 'a', probability: 80 }, { id: 'b', probability: 5 }, { id: 'c', probability: 10 }, { id: 'd', probability: 5 }];
  const second = forecast(altered, key, { simulations: 6000, uncertainty: 4 });
  const b = result => result.rows.find(row => row.id === 'b');
  assert.ok(b(first).winLower > b(second).winLower);
  assert.notEqual(b(first).score, b(second).score);
  assert.notEqual(b(first).qualification, b(second).qualification);
  // Le marché ne touche pas au centre des scores : il repondère seulement les simulations.
  assert.equal(b(first).center, b(second).center);
  assert.ok(Math.abs(first.rows.reduce((total, row) => total + row.score, 0) - 100) < 1e-8);
  assert.ok(Math.abs(first.rows.reduce((total, row) => total + row.qualification, 0) - 200) < 1e-8);
  assert.ok(first.rows.every(row => row.winLower <= row.winUpper && row.winUpper <= row.qualification + 1e-8));
  assert.ok(first.marketFusion.effectiveSampleSize > 1000);
});

test('market prices cannot invent a missing runoff or a simulated winner', () => {
  const data = addSignals(dataset(firstRound));
  // Un petit poids évite une majorité dès le premier tour : sans duel sondé, aucun vainqueur n'est inventé.
  const result = forecast(data, key, { weights: { polls: 100, polymarket: 5 }, simulations: 2000, horizon: false });
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
  assert.deepEqual(settingsFrom({ halfLife: 'oops', uncertainty: -1, simulations: 1 }), { halfLife: 21, weights: DEFAULT_WEIGHTS, uncertainty: 0, simulations: 1000, horizon: true });
  assert.equal(settingsFrom({ horizon: false }).horizon, false);
});

test('60 per mille with x2 gives about a 12 percent relative boost, not twelve points', () => {
  const data = addSignals(dataset([poll('p', {a: 40, b: 30, c: 20, d: 10})]));
  const result = forecast(data, key, { weights: { polls: 100, barometer: 40 }, simulations: 1000 });
  const row = result.rows.find(row => row.id === 'd');
  assert.ok(Math.abs(row.corrections.barometer - 10 * effect(0.0595 * 2)) < 1e-10);
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
  const documented = forecast(dataset([...firstRound, ...completeDuels()]), key, { simulations: 3000, horizon: false });
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

test('the qualification and place markets reweight the simulations they describe', () => {
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
  const qualification = (output, id) => output.rows.find(row => row.id === id).qualification;
  assert.ok(qualification(result, 'c') > qualification(plain, 'c'));
  assert.ok(Math.abs(result.rows.reduce((total, row) => total + row.qualification, 0) - 200) < 1e-8);
  assert.ok(result.marketFusion.effectiveSampleSize > 1000);
  assert.equal(forecast(data, key, { ...settings, weights: { polls: 100 } }).marketFusion.active, false);
  // Le marché du vainqueur du premier tour favorise les simulations où son favori arrive en tête.
  data.marketEvents = { winner: board({ a: 5, b: 5, c: 5, d: 85 }) };
  const places = forecast(data, key, settings);
  assert.ok(places.marketFusion.boards.find(item => item.id === 'winner').active);
  const score = (output, id) => output.rows.find(row => row.id === id).score;
  assert.ok(score(places, 'd') > score(plain, 'd'));
  assert.ok(places.rows.find(row => row.id === 'd').corrections.polymarket > 0);
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
  Object.assign(window, { a: { score: 0.4, coverage: 4 }, b: { score: -40, coverage: 4 }, c: { score: 400, coverage: 4 }, d: { score: -0.3, coverage: 4 } });
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

test('a win probability is never converted into a first-round score', () => {
  const data = dataset(firstRound);
  data.market = { capturedAt: `${data.asOf}T12:00:00Z`, markets: [{ id: 'a', probability: 45 }, { id: 'b', probability: 35 }, { id: 'c', probability: 15 }, { id: 'd', probability: 5 }] };
  const run = weights => forecast(data, key, { weights, simulations: 2000 });
  const market = run({ polls: 100, polymarket: 100 });
  const pollsOnly = run({ polls: 100 });
  for (const row of market.rows) {
    assert.equal(row.center, pollsOnly.rows.find(item => item.id === row.id).center);
    assert.ok(Math.abs(row.center - row.pollScore) < 1e-9);
  }
});

test('the victory market reweights the simulations: a backed candidate wins more often, polls-only stays untouched', () => {
  const data = dataset([...firstRound, ...completeDuels()]);
  const stamp = `${data.asOf}T12:00:00Z`;
  data.market = { capturedAt: stamp, markets: [{ id: 'a', probability: 40 }, { id: 'b', probability: 10 }, { id: 'c', probability: 5 }, { id: 'd', probability: 45 }] };
  const run = weights => forecast(data, key, { weights, simulations: 4000 });
  const win = (result, id) => result.rows.find(item => item.id === id).winLower;
  const pollsOnly = run({ polls: 100 });
  const backed = run({ polls: 100, polymarket: 50 });
  const stronger = run({ polls: 100, polymarket: 100 });
  assert.ok(pollsOnly.rows.every(item => item.corrections.polymarket === 0));
  assert.ok(win(backed, 'd') > win(pollsOnly, 'd'));
  assert.ok(win(stronger, 'd') > win(backed, 'd'));
  assert.ok(backed.rows.find(item => item.id === 'd').corrections.polymarket > 0);
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

test('the market leaves the polled duel scores alone: only dynamics shift a duel', () => {
  const data = dataset([poll('p1', { a: 45, b: 35, c: 20 }), poll('duel', { a: 70, b: 30 }, { round: 2 })]);
  data.market = { capturedAt: `${data.asOf}T12:00:00Z`, markets: [{ id: 'a', probability: 40 }, { id: 'b', probability: 55 }, { id: 'c', probability: 5 }] };
  const run = weights => forecast(data, 'a|b|c', { weights, simulations: 4000 });
  const duel = result => result.polledDuels.find(item => item.key === 'a|b');
  const pollsOnly = run({ polls: 100 });
  const market = run({ polls: 100, polymarket: 100 });
  assert.deepEqual(market.duelShifts, {});
  assert.equal(duel(market).projection.scores.a, duel(pollsOnly).projection.scores.a);
  assert.equal(duel(market).estimate.scores.a, 70);
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


test('uncertainty is measured: more surveys tighten it, and only irregular source moves widen it', () => {
  const surveys = count => Array.from({ length: count }, (_, index) => poll(`p${index}`, { a: 35 + (index % 2 ? 3 : -3), b: 65 - (index % 2 ? 3 : -3) }, { institute: `I${index}` }));
  const run = (polls, settings = {}) => forecast(dataset(polls), 'a|b', { weights: { polls: 100 }, simulations: 3000, ...settings }).rows.find(row => row.id === 'a');
  assert.ok(run(surveys(12)).uncertainty.polls < run(surveys(3)).uncertainty.polls);
  assert.ok(Math.abs(run([poll('p1', { a: 40, b: 60 })]).uncertainty.polls - 100 * Math.sqrt(0.4 * 0.6 / 1000)) < 1e-9);
  const days = ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20'];
  const series = values => Object.fromEntries(days.map((day, index) => [day, values[index]]));
  const data = dataset(surveys(4));
  data.market = { capturedAt: `${data.asOf}T12:00:00Z`, markets: [{ id: 'a', probability: 40 }, { id: 'b', probability: 60 }] };
  const part = () => forecast(data, 'a|b', { weights: { polls: 100, polymarket: 50 }, simulations: 500 }).rows.find(row => row.id === 'a').uncertainty.polymarket;
  data.history = { polymarket: { a: series([10, 12, 14.4, 17.28, 20.74, 24.88, 29.86]) } };
  const steady = part();
  data.history = { polymarket: { a: series([10, 30, 8, 35, 6, 40, 10]) } };
  assert.ok(part() > steady * 5);
  const off = forecast(data, 'a|b', { weights: { polls: 100 }, simulations: 500 }).rows.find(row => row.id === 'a').uncertainty;
  assert.equal(off.polymarket, 0);
  assert.ok(Math.abs(off.base - off.polls) < 1e-9);
});

const wikipediaWindow = (data, signals) => ({ asOf: data.asOf, windows: { '2026-10-19': { anchor: '2026-10-19', signals } } });

test('every polled duel gets the same source adjustment as a simulated duel', () => {
  // Le duel a|c n'est presque jamais simulé : c est loin derrière au premier tour.
  const data = dataset([
    poll('p1', { a: 45, b: 35, c: 5, d: 15 }),
    poll('duel-ab', { a: 60, b: 40 }, { round: 2 }),
    poll('duel-ac', { a: 60, c: 40 }, { round: 2 }),
  ]);
  data.wikipedia = wikipediaWindow(data, { a: { dynamic: -0.5 }, b: { dynamic: 0.4 }, c: { dynamic: 0.8 } });
  const run = weights => forecast(data, 'a|b|c|d', { weights, simulations: 4000 });
  const polled = (result, key) => result.polledDuels.find(duel => duel.key === key);

  const pollsOnly = run({ polls: 100 });
  assert.ok(Math.abs(polled(pollsOnly, 'a|c').projection.scores.a - polled(pollsOnly, 'a|c').estimate.scores.a) < 1e-9);

  const dynamic = run({ polls: 100, wikipedia: 100 });
  const rare = polled(dynamic, 'a|c');
  assert.ok(rare.projection.scores.a < polled(pollsOnly, 'a|c').projection.scores.a);
  assert.ok(Math.abs(rare.projection.scores.a + rare.projection.scores.c - 100) < 1e-9);
  assert.ok(rare.projection.lower.a <= rare.projection.scores.a && rare.projection.scores.a <= rare.projection.upper.a);
  assert.equal(rare.estimate.scores.a, polled(pollsOnly, 'a|c').estimate.scores.a);

  // Pour un duel simulé, le calcul direct retrouve le résultat des simulations.
  const simulated = dynamic.pairs.find(pair => pair.key === 'a|b').projection;
  assert.ok(Math.abs(polled(dynamic, 'a|b').projection.scores.a - simulated.scores.a) < 0.5);
  assert.ok(Math.abs(polled(dynamic, 'a|b').projection.lower.a - simulated.lower.a) < 1);
});

test('strong dynamics can overturn a polled duel', () => {
  const data = dataset([poll('p1', { a: 45, b: 35, c: 20 }), poll('duel', { a: 51, b: 49 }, { round: 2 })]);
  data.wikipedia = wikipediaWindow(data, { a: { dynamic: -1 }, b: { dynamic: 1 } });
  const run = weights => forecast(data, 'a|b|c', { weights, simulations: 4000 }).pairs.find(pair => pair.key === 'a|b').projection;
  assert.ok(run({ polls: 100 }).scores.a > 50);
  assert.ok(run({ polls: 100, wikipedia: 100 }).scores.a < 50);
});

test('the election horizon widens the intervals and removes false certainties', () => {
  const data = dataset([poll('p1', { a: 34, b: 17, c: 10, d: 39 })]);
  const run = horizon => forecast(data, key, { weights: { polls: 100 }, simulations: 6000, horizon });
  const row = (result, id) => result.rows.find(item => item.id === id);
  const today = run(false);
  const election = run(true);
  assert.ok(election.election.daysToElection > 150);
  assert.ok(row(election, 'a').upper - row(election, 'a').lower > 3 * (row(today, 'a').upper - row(today, 'a').lower));
  assert.ok(row(election, 'a').today.upper - row(election, 'a').today.lower < 5);
  assert.equal(row(today, 'b').qualification, 0);
  assert.ok(row(election, 'b').qualification > 1 && row(election, 'b').qualification < 30);
  assert.ok(Math.abs(row(election, 'a').score - 34) < 1.5);
  // Écart-type calibré : près de 2 points la veille, plus de 6 à cinq mois, proportionnel sous 10 %.
  assert.equal(horizonSpread(30, 0), HORIZON_SPREAD.floor);
  assert.ok(horizonSpread(30, 160) > 6 && horizonSpread(30, 160) < HORIZON_SPREAD.plateau);
  assert.ok(Math.abs(horizonSpread(5, 160) - horizonSpread(30, 160) / 2) < 1e-9);
});

test('an unpolled duel is estimated from vote transfers between political blocs', () => {
  const ids = ['le-pen', 'macron', 'melenchon', 'pecresse'];
  const data = dataset([poll('p1', { 'le-pen': 30, macron: 34, melenchon: 24, pecresse: 12 })]);
  const parties = { 'le-pen': 'RN', macron: 'RE', melenchon: 'LFI', pecresse: 'LR' };
  data.candidates = ids.map(id => ({ id, name: id, party: parties[id], family: parties[id] }));
  const result = forecast(data, candidateKey(ids), { weights: { polls: 100 }, simulations: 4000 });
  const duel = result.pairs.find(pair => pair.key === 'le-pen|macron');
  assert.equal(duel.basis, 'transfers');
  assert.equal(duel.estimate, null);
  assert.ok(duel.projection.scores.macron > 50 && duel.projection.scores.macron < 70);
  assert.ok(duel.projection.upper.macron - duel.projection.lower.macron > 10);
  assert.ok(result.unresolved < 100);
  // La matrice reconstitue le second tour 2022 à partir du premier tour officiel, à moins de 3 points.
  const blocs = { Macron: 'centre', 'Le Pen': 'extreme-droite', Mélenchon: 'extreme-gauche', Zemmour: 'extreme-droite', Pécresse: 'droite', Jadot: 'gauche' };
  const scores = { Macron: 27.85, 'Le Pen': 23.15, Mélenchon: 21.95, Zemmour: 7.07, Pécresse: 4.78, Jadot: 4.63 };
  assert.ok(Math.abs(transferScore('Macron', 'Le Pen', scores, id => blocs[id]) - 58.55) < 3);
  // Deux finalistes du même camp : aucun report mesuré, donc aucun score.
  assert.equal(transferScore('Le Pen', 'Zemmour', scores, id => blocs[id]), null);
});
