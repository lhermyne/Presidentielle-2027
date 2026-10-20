// Shared by browser and Actions. Signals retain their units and roles; the fusion is an explicit heuristic.
export const MODEL_VERSION = '0.3.0-independent-barometer-experimental';
export const SOURCE_IDS = Object.freeze(['polls', 'polymarket', 'trends']);
export const SIGNAL_IDS = Object.freeze(['polls', 'barometer', 'polymarket', 'trends']);
export const SOURCE_LABELS = Object.freeze({ polls: 'Sondages', barometer: 'Baromètre', polymarket: 'Polymarket', trends: 'Google Trends' });
export const DEFAULT_WEIGHTS = Object.freeze({ polls: 73, polymarket: 20, trends: 7 });
export const DEFAULT_SETTINGS = Object.freeze({ halfLife: 21, weights: DEFAULT_WEIGHTS, barometerMultiplier: 3, uncertainty: 4, simulations: 16000 });
const DAY = 86400000;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const daysBetween = (a, b) => (Date.parse(a) - Date.parse(b)) / DAY;
const sum = values => values.reduce((a, b) => a + b, 0);
export const candidateKey = ids => [...ids].sort().join('|');

// Largest-remainder rounding keeps integer sliders at exactly 100, including ties.
function allocate(total, keys, ratios) {
  const denominator = sum(keys.map(key => ratios[key]));
  const raw = keys.map(key => ({ key, value: denominator > 0 ? total * ratios[key] / denominator : total / keys.length }));
  const output = Object.fromEntries(raw.map(({ key, value }) => [key, Math.floor(value)]));
  const remainder = total - sum(Object.values(output));
  raw.sort((a, b) => (b.value - Math.floor(b.value)) - (a.value - Math.floor(a.value)) || SOURCE_IDS.indexOf(a.key) - SOURCE_IDS.indexOf(b.key));
  for (let i = 0; i < remainder; i++) output[raw[i].key]++;
  return output;
}

export function normalizeWeights(input = DEFAULT_WEIGHTS) {
  const ratios = Object.fromEntries(SOURCE_IDS.map(key => [key, Number.isFinite(Number(input?.[key])) ? clamp(Number(input[key]), 0, 100) : 0]));
  return allocate(100, SOURCE_IDS, sum(Object.values(ratios)) > 0 ? ratios : DEFAULT_WEIGHTS);
}

export function redistributeWeights(current, changed, value) {
  const weights = normalizeWeights(current);
  if (!SOURCE_IDS.includes(changed)) return weights;
  const target = Number.isFinite(Number(value)) ? Math.round(clamp(Number(value), 0, 100)) : weights[changed];
  const others = SOURCE_IDS.filter(key => key !== changed);
  const ratios = sum(others.map(key => weights[key])) > 0 ? weights : DEFAULT_WEIGHTS;
  return { ...allocate(100 - target, others, ratios), [changed]: target };
}

export function settingsFrom(input = {}) {
  const finite = (key, fallback) => Number.isFinite(Number(input[key])) ? Number(input[key]) : fallback;
  return {
    halfLife: clamp(finite('halfLife', 21), 7, 90),
    weights: normalizeWeights(input.weights),
    barometerMultiplier: clamp(finite('barometerMultiplier', 3), 0, 5),
    uncertainty: clamp(finite('uncertainty', 4), 2, 8),
    simulations: Math.round(clamp(finite('simulations', 16000), 1000, 50000)),
  };
}

function validPoll(poll, asOf) {
  const values = Object.values(poll.scores ?? {});
  return poll.fieldEnd <= asOf && Number.isFinite(Date.parse(poll.fieldEnd)) &&
    values.length >= 2 && values.every(x => Number.isFinite(x) && x >= 0 && x <= 100) &&
    Math.abs(sum(values) - 100) <= 2;
}

export function listConfigurations(data) {
  const configurations = new Map();
  for (const poll of data.polls ?? []) {
    if (poll.round !== 1 || !validPoll(poll, data.asOf) || daysBetween(data.asOf, poll.fieldEnd) > 120) continue;
    const ids = Object.keys(poll.scores).sort();
    const key = candidateKey(ids);
    const existing = configurations.get(key) ?? { id: key, candidateIds: ids, pollIds: new Set(), latest: '', example: poll };
    existing.pollIds.add(poll.id);
    if (poll.fieldEnd > existing.latest || (poll.fieldEnd === existing.latest && poll.main)) {
      existing.latest = poll.fieldEnd;
      existing.example = poll;
    }
    configurations.set(key, existing);
  }
  return [...configurations.values()].map(c => ({ ...c, pollCount: c.pollIds.size, pollIds: undefined }))
    .sort((a, b) => b.latest.localeCompare(a.latest) || Number(b.example.main) - Number(a.example.main) || b.pollCount - a.pollCount || a.id.localeCompare(b.id));
}

export function selectPolls(data, configurationId, asOf = data.asOf) {
  return (data.polls ?? []).filter(p => p.round === 1 && validPoll(p, asOf) &&
    candidateKey(Object.keys(p.scores)) === configurationId && daysBetween(asOf, p.fieldEnd) <= 120);
}

export function aggregatePolls(polls, candidateIds, asOf, halfLife = 21) {
  if (!polls.length) return null;
  const bySurvey = new Map();
  const instituteCounts = new Map();
  // Identical candidate sets tested repeatedly within one survey count once.
  for (const poll of polls) {
    const survey = bySurvey.get(poll.id) ?? { ...poll, scores: Object.fromEntries(candidateIds.map(id => [id, 0])), count: 0 };
    for (const id of candidateIds) survey.scores[id] += poll.scores[id];
    survey.count++;
    bySurvey.set(poll.id, survey);
  }
  for (const survey of bySurvey.values()) instituteCounts.set(survey.institute, (instituteCounts.get(survey.institute) ?? 0) + 1);
  const scores = Object.fromEntries(candidateIds.map(id => [id, 0]));
  let totalWeight = 0;
  for (const survey of bySurvey.values()) {
    const age = Math.max(0, daysBetween(asOf, survey.fieldEnd));
    const weight = Math.pow(0.5, age / halfLife) * Math.sqrt(clamp(survey.sampleSize || 1000, 100, 5000) / 1000) /
      Math.sqrt(instituteCounts.get(survey.institute));
    for (const id of candidateIds) scores[id] += weight * survey.scores[id] / survey.count;
    totalWeight += weight;
  }
  const total = sum(Object.values(scores));
  if (!(total > 0 && totalWeight > 0)) return null;
  for (const id of candidateIds) scores[id] = 100 * scores[id] / total;
  return { scores, pollCount: bySurvey.size, instituteCount: instituteCounts.size,
    latest: [...bySurvey.values()].map(p => p.fieldEnd).sort().at(-1) };
}

function makeRandom(seed = 2027) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function normalGenerator(random) {
  let spare = null;
  return () => {
    if (spare !== null) { const result = spare; spare = null; return result; }
    const radius = Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12)));
    const angle = 2 * Math.PI * random();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}

const recent = (asOf, observed, maxAge) => observed && Number.isFinite(Date.parse(observed)) && daysBetween(asOf, observed.slice(0, 10)) >= 0 && daysBetween(asOf, observed.slice(0, 10)) <= maxAge;
// A relative dynamic is a bounded correction, never a candidate's vote share.
function centeredSignal(ids, values) {
  const observed = ids.filter(id => Number.isFinite(values[id]));
  if (observed.length < 2) return null;
  const transformed = observed.map(id => Math.asinh(values[id]));
  const mean = sum(transformed) / transformed.length;
  const deviation = Math.sqrt(sum(transformed.map(value => (value - mean) ** 2)) / transformed.length);
  const raw = transformed.map(value => deviation > 1e-10 ? clamp((value - mean) / deviation, -1, 1) : 0);
  const center = sum(raw) / raw.length;
  const scale = Math.max(1, ...raw.map(value => Math.abs(value - center)));
  return { values: Object.fromEntries(ids.map(id => [id, observed.includes(id) ? (raw[observed.indexOf(id)] - center) / scale : 0])),
    observed, missing: ids.filter(id => !observed.includes(id)) };
}

export function sourceComponents(data, ids, halfLife = 21, baseline = null) {
  const poll = baseline ?? aggregatePolls(selectPolls(data, candidateKey(ids)), ids, data.asOf, halfLife);
  const components = {
    polls: { available: Boolean(poll), latest: poll?.latest, reason: 'Socle électoral : intentions de vote dans une liste exacte de candidats.' },
    barometer: { available: false, reason: 'Deux candidats avec une dynamique mesurable depuis le dernier terrain, sur au moins deux plateformes récentes, sont nécessaires.' },
    polymarket: { available: false, reason: 'Deux candidats cotés et une capture de moins de 7 jours sont nécessaires.' },
    trends: { available: false, reason: 'Moins de deux candidats identifiés dans les recherches en hausse sur 28 jours, ou collecte de plus de 3 jours.' },
  };
  if (recent(data.asOf, data.social?.asOf, 3)) {
    const window = data.social.windows?.[poll?.latest];
    const observed = ids.filter(id => window?.signals?.[id]?.coverage >= 2 && Number.isFinite(window.signals[id].score));
    if (observed.length >= 2) components.barometer = { available: true, latest: data.social.asOf, anchor: window.anchor, periods: window.signals,
      raw: Object.fromEntries(observed.map(id => [id, window.signals[id].score])), observed, missing: ids.filter(id => !observed.includes(id)),
      reason: 'Dynamique pondérée cumulée depuis la fin du dernier terrain compatible (date de publication absente du CSV). Variation en ‰ appliquée relativement au propre score sondé du candidat, avec multiplicateur et plafond explicites.' };
  }
  if (recent(data.asOf, data.market?.capturedAt, 7)) {
    const prices = Object.fromEntries((data.market.markets ?? []).filter(m => ids.includes(m.id) && Number.isFinite(m.probability) && m.probability >= 0 && m.probability <= 100).map(m => [m.id, m.probability]));
    if (Object.keys(prices).length >= 2 && sum(Object.values(prices)) > 0) components.polymarket = { available: true, prices, latest: data.market.capturedAt.slice(0, 10),
      reason: 'Anticipations de victoire finale. Repondération modérée des trajectoires avec gagnant documenté, sans transformer les prix en scores du premier tour.' };
  }
  if (recent(data.asOf, data.trends?.asOf, 3)) {
    const signal = centeredSignal(ids, data.trends.interest ?? {});
    if (signal) components.trends = { ...signal, available: true, latest: data.trends.asOf,
      reason: 'Recherches en forte hausse : correction d’attention bornée sur 28 jours. Une recherche peut exprimer un soutien, une critique ou de la curiosité.' };
  }
  return components;
}

function weightedQuantile(samples, probability, totalWeight) {
  const threshold = probability * totalWeight;
  let cumulative = 0;
  for (const [value, weight] of samples) {
    cumulative += weight;
    if (cumulative >= threshold) return value;
  }
  return samples.at(-1)?.[0] ?? 0;
}

// Market prices describe a different candidate universe and are not independent
// observations. This is an explicit, capped sensitivity heuristic, not Bayes fitting.
function marketLikelihood(ids, trajectories, component, influence) {
  const factors = Object.fromEntries(ids.map(id => [id, 1]));
  const wins = Object.fromEntries(ids.map(id => [id, 0]));
  for (const draw of trajectories) if (draw.winner !== null) wins[ids[draw.winner]]++;
  const compared = ids.filter(id => wins[id] >= 10 && Number.isFinite(component.prices?.[id]));
  const excluded = ids.filter(id => !compared.includes(id));
  const marketTotal = sum(compared.map(id => component.prices[id]));
  if (!component.available || !influence || compared.length < 2 || marketTotal <= 0) return { active: false, factors, compared: [], excluded,
    reason: !influence ? 'Influence du marché réglée à zéro.' : 'Pas assez de gagnants simulés documentés et cotés : aucun effet forcé du marché.' };
  const winsTotal = sum(compared.map(id => wins[id]));
  const marketShares = Object.fromEntries(compared.map(id => [id, component.prices[id] / marketTotal]));
  const modelShares = Object.fromEntries(compared.map(id => [id, wins[id] / winsTotal]));
  const raw = Object.fromEntries(compared.map(id => [id, Math.pow(clamp(marketShares[id] / modelShares[id], 0.05, 20), influence)]));
  const average = sum(compared.map(id => wins[id] * raw[id])) / winsTotal;
  for (const id of compared) factors[id] = raw[id] / average;
  return { active: true, factors, compared, excluded, marketShares, modelShares,
    reason: 'Prix de victoire comparés uniquement entre gagnants documentés et cotés (au moins 10 tirages chacun). Rapport plafonné entre 0,05 et 20, élevé au poids du marché ; masse totale de ces trajectoires conservée. Les autres trajectoires restent inchangées.' };
}

export function runoffEstimates(data, ids, settings = DEFAULT_SETTINGS) {
  const groups = new Map();
  for (const poll of data.polls ?? []) {
    const candidates = Object.keys(poll.scores ?? {});
    if (poll.round !== 2 || candidates.length !== 2 || !candidates.every(id => ids.includes(id)) ||
      !validPoll(poll, data.asOf) || daysBetween(data.asOf, poll.fieldEnd) > 120) continue;
    const key = candidateKey(candidates);
    const records = groups.get(key) ?? [];
    records.push(poll);
    groups.set(key, records);
  }
  return Object.fromEntries([...groups].map(([key, polls]) => [key, {
    ...aggregatePolls(polls, key.split('|'), data.asOf, settings.halfLife), candidateIds: key.split('|'),
  }]));
}

export function forecast(data, configurationId, rawSettings = {}) {
  const settings = settingsFrom(rawSettings);
  const configurations = listConfigurations(data);
  const configuration = configurations.find(c => c.id === configurationId) ?? configurations[0];
  if (!configuration) return { error: 'Aucune configuration de premier tour exploitable.', rows: [], settings };
  const ids = configuration.candidateIds;
  const baseline = aggregatePolls(selectPolls(data, configuration.id), ids, data.asOf, settings.halfLife);
  if (!baseline) return { error: 'Aucun sondage compatible depuis 120 jours.', rows: [], settings, configuration };
  const components = sourceComponents(data, ids, settings.halfLife, baseline);
  const availableWeight = sum(SOURCE_IDS.filter(id => components[id].available).map(id => settings.weights[id]));
  const sourceMix = Object.fromEntries(SOURCE_IDS.map(id => [id, { ...components[id], requested: settings.weights[id], effective: availableWeight > 0 && components[id].available ? settings.weights[id] * 100 / availableWeight : 0 }]));
  sourceMix.barometer = { ...components.barometer, mode: 'independent-multiplier',
    multiplier: settings.barometerMultiplier, effectiveMultiplier: components.barometer.available ? settings.barometerMultiplier : 0 };
  if (!settings.weights.polls || !availableWeight) return { error: 'Une dynamique sociale ou un prix de victoire ne suffit pas à estimer des scores électoraux. Redonnez un poids aux sondages pour projeter le premier tour. Les signaux bruts restent consultables ci-dessous.', rows: [], settings, configuration, baseline, sourceMix };
  // Weight is an influence budget: it does not make unlike quantities additive.
  const socialScale = sourceMix.barometer.effectiveMultiplier;
  const relativeLimit = 0.5;
  const trendsLimit = 4 * sourceMix.trends.effective / 100;
  const corrections = Object.fromEntries(ids.map(id => [id, {
    barometer: socialScale ? baseline.scores[id] * clamp((components.barometer.raw?.[id] ?? 0) / 1000 * socialScale, -relativeLimit, relativeLimit) : 0,
    trends: trendsLimit ? (components.trends.values?.[id] ?? 0) * trendsLimit : 0,
  }]));
  const rawCenters = ids.map(id => Math.max(0.05, baseline.scores[id] + corrections[id].barometer + corrections[id].trends));
  const centers = rawCenters.map(value => value * 100 / sum(rawCenters));
  const duels = runoffEstimates(data, ids, settings);
  const normal = normalGenerator(makeRandom());
  const meta = Object.fromEntries((data.candidates ?? []).map(c => [c.id, c]));
  const trajectories = [];
  const sigma = settings.uncertainty + Math.min(3, Math.max(0, daysBetween(data.asOf, baseline.latest)) / 30);
  for (let iteration = 0; iteration < settings.simulations; iteration++) {
    const families = new Map();
    const draws = centers.map((center, index) => {
      const family = meta[ids[index]]?.family ?? ids[index];
      if (!families.has(family)) families.set(family, normal());
      return Math.max(0.02, center + sigma * Math.sqrt(Math.max(center, 1) / 25) * (0.55 * families.get(family) + Math.sqrt(1 - 0.55 ** 2) * normal()));
    });
    const total = sum(draws);
    const scores = draws.map(x => x * 100 / total);
    const [first, second] = ids.map((_, index) => index).sort((a, b) => scores[b] - scores[a]);
    const key = scores[first] > 50 ? null : candidateKey([ids[first], ids[second]]);
    const duel = key ? duels[key] : null;
    let winner = key ? null : first;
    if (duel) {
      const age = Math.min(3, Math.max(0, daysBetween(data.asOf, duel.latest)) / 30);
      winner = duel.scores[ids[first]] + normal() * (settings.uncertainty + age) > 50 ? first : second;
    }
    trajectories.push({ scores, first, second, winner, key });
  }
  const marketFusion = marketLikelihood(ids, trajectories, components.polymarket, sourceMix.polymarket.effective / 100);
  const counts = ids.map(() => ({ topTwo: 0, wins: 0, unknown: 0, total: 0, samples: [] }));
  const pairCounts = new Map();
  let totalWeight = 0, squaredWeight = 0, unresolved = 0;
  for (const draw of trajectories) {
    const weight = draw.winner === null ? 1 : marketFusion.factors[ids[draw.winner]];
    totalWeight += weight; squaredWeight += weight ** 2;
    draw.scores.forEach((value, index) => { counts[index].samples.push([value, weight]); counts[index].total += value * weight; });
    counts[draw.first].topTwo += weight; counts[draw.second].topTwo += weight;
    if (draw.key) pairCounts.set(draw.key, (pairCounts.get(draw.key) ?? 0) + weight);
    if (draw.winner === null) { unresolved += weight; counts[draw.first].unknown += weight; counts[draw.second].unknown += weight; }
    else counts[draw.winner].wins += weight;
  }
  const rows = ids.map((id, index) => {
    const result = counts[index];
    result.samples.sort((a, b) => a[0] - b[0]);
    return { id, name: meta[id]?.name ?? id, party: meta[id]?.party ?? '', color: meta[id]?.color ?? '#687b81', photo: meta[id]?.photo ?? null,
      pollScore: baseline.scores[id], center: centers[index], corrections: corrections[id], renormalization: centers[index] - baseline.scores[id] - corrections[id].barometer - corrections[id].trends,
      score: result.total / totalWeight, lower: weightedQuantile(result.samples, 0.05, totalWeight), upper: weightedQuantile(result.samples, 0.95, totalWeight),
      qualification: result.topTwo / totalWeight * 100, winLower: result.wins / totalWeight * 100, winUpper: (result.wins + result.unknown) / totalWeight * 100 };
  }).sort((a, b) => b.score - a.score);
  return { modelVersion: MODEL_VERSION, settings, configuration, baseline, rows, sourceMix,
    adjustmentLimits: { barometerRelative: relativeLimit * 100, barometerScale: socialScale, trends: trendsLimit }, marketFusion: { ...marketFusion, effectiveSampleSize: totalWeight ** 2 / squaredWeight },
    unresolved: unresolved / totalWeight * 100,
    pairs: [...pairCounts].map(([key, count]) => ({ key, probability: count / totalWeight * 100, estimate: duels[key] ?? null })).sort((a, b) => b.probability - a.probability),
    isPersonal: settings.halfLife !== 21 || settings.barometerMultiplier !== 3 || settings.uncertainty !== 4 || SOURCE_IDS.some(id => settings.weights[id] !== DEFAULT_WEIGHTS[id]), experimental: true };
}

export function pollingHistory(data, configurationId, halfLife = 21) {
  const ids = configurationId.split('|');
  const dates = [...new Set(selectPolls(data, configurationId).map(p => p.fieldEnd))].sort();
  return dates.map(date => ({ date, scores: aggregatePolls(selectPolls(data, configurationId, date), ids, date, halfLife).scores }));
}
