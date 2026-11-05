// Shared by browser and Actions. Signals retain their units and roles; the fusion is an explicit heuristic.
export const MODEL_VERSION = '0.12.0-measured-uncertainty-experimental';
export const SOURCE_IDS = Object.freeze(['polls', 'polymarket', 'barometer', 'wikipedia', 'trends']);
export const SIGNAL_IDS = SOURCE_IDS;
export const DYNAMIC_IDS = Object.freeze(['barometer', 'wikipedia', 'trends']);
export const SOURCE_LABELS = Object.freeze({ polls: 'Sondages', barometer: 'Baromètre', polymarket: 'Polymarket', wikipedia: 'Wikipédia', trends: 'Google Trends' });
// Curseurs indépendants de 0 à 100 ; seule leur proportion compte. Les sondages restent le socle (minimum 1).
// Référence : sondages 100, Polymarket 50, baromètre ×2, Wikipédia ×1, Google Trends léger (verrouillé sans signal).
export const DEFAULT_WEIGHTS = Object.freeze({ polls: 100, polymarket: 50, barometer: 40, wikipedia: 20, trends: 10 });
export const MIN_POLL_WEIGHT = 1;
// Baromètre et Wikipédia se règlent en multiplicateur direct de ×0 à ×5 : chaque unité occupe 20 dans la barre d'influence.
export const MULTIPLIER_IDS = Object.freeze(['barometer', 'wikipedia']);
export const WEIGHT_PER_MULTIPLIER = 20;
export const sourceMultiplier = (weights, id) => normalizeWeights(weights)[id] / WEIGHT_PER_MULTIPLIER;
// Une dynamique Wikipédia (log du rapport de consultations, bornée à ±1) vaut 10 % relatifs à ×1.
export const WIKIPEDIA_UNIT = 0.1;
// Sous ces seuils, une dynamique est considérée comme stable : 0,5 ‰ d'abonnés, 5 % environ de consultations.
export const BAROMETER_NOISE = 0.5;
export const WIKIPEDIA_NOISE = 0.05;
// Compression douce des très fortes variations, sans plafond brutal (effet maximal : ×e^1,5 ou ÷e^1,5).
export const DYNAMIC_SATURATION = 1.5;
// Identifiant de la liste reconstruite à partir de tous les sondages.
export const FIELD_ID = 'field';
// Écarte les candidatures que le marché juge marginales : bulletin ≥ 15 % ou victoire ≥ 1 %.
export const MIN_BALLOT_PRICE = 15;
export const MIN_WIN_PRICE = 1;
// Sans marché récent, seuls les candidats testés dans au moins 5 enquêtes sont retenus.
export const MIN_SURVEYS_WITHOUT_MARKET = 5;
// Camps politiques : un absent reporte d'abord ses voix dans son camp. Hypothèse explicite, par étiquette.
export const POLITICAL_BLOCS = Object.freeze({
  LO: 'extreme-gauche', LFI: 'extreme-gauche',
  PCF: 'gauche', LE: 'gauche', PS: 'gauche', PP: 'gauche', GRS: 'gauche',
  RE: 'centre', HOR: 'centre', LFH: 'centre',
  LR: 'droite', DLF: 'droite', SE: 'droite',
  RN: 'extreme-droite', REC: 'extreme-droite',
});
// Candidats d'un même parti : ils ne se présenteront pas ensemble, leurs sondages et leurs prix vont à 100 % au titulaire.
export const SAME_PARTY_REPORTS = Object.freeze({
  'jordan-bardella': 'marine-le-pen',
  'sarah-knafo': 'eric-zemmour',
  'gerald-darmanin': 'gabriel-attal', 'sebastien-lecornu': 'gabriel-attal', 'bruno-le-maire': 'gabriel-attal',
  'xavier-bertrand': 'bruno-retailleau', 'laurent-wauquiez': 'bruno-retailleau',
  'olivier-faure': 'francois-hollande', 'segolene-royal': 'francois-hollande', 'jerome-guedj': 'francois-hollande', 'karim-bouamrane': 'francois-hollande',
});
// Polymarket avant les simulations : la victoire finale est la base, les places l'affinent. Chaque niveau est comparé
// au score des sondages ; les places sont cumulées (1er, 2 premiers, 3 premiers).
const MARKET_BASE_LEVELS = Object.freeze([
  { key: 'president', weight: 1 / 2, boards: ['president'] },
  { key: 'winner', weight: 1 / 6, boards: ['winner'] },
  { key: 'second', weight: 1 / 6, boards: ['winner', 'second'] },
  { key: 'third', weight: 1 / 6, boards: ['winner', 'second', 'third'] },
]);
// Après les simulations, seule la qualification repondère : la victoire finale agit déjà sur les duels.
const POST_SIMULATION_BOARDS = Object.freeze(['advance']);
// Force du marché de victoire sur les duels, en plus de la part de Polymarket.
const DUEL_MARKET_UNIT = 0.1;
const DUEL_PRE_SIMULATIONS = 4000;
// Évite qu'un écart entre deux probabilités infimes pèse lourd : un petit candidat reste neutre.
const MARKET_FLOOR = 0.02;
// Force de l'écart entre le marché et les sondages, multipliée par la part de Polymarket.
export const MARKET_UNIT = 2;
// Aléa de référence d'une enquête : un échantillon de 1 000 personnes.
const REFERENCE_SAMPLE = 1000;
const MIN_POLLS_FOR_SPREAD = 3;
const POLL_WINDOW_DAYS = 120;
const FIT_MAX_ITERATIONS = 400;
const FIT_TOLERANCE = 1e-7;
export const DEFAULT_SETTINGS = Object.freeze({ halfLife: 21, weights: DEFAULT_WEIGHTS, uncertainty: 0, simulations: 16000 });
const DAY = 86400000;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const daysBetween = (a, b) => (Date.parse(a) - Date.parse(b)) / DAY;
const sum = values => values.reduce((a, b) => a + b, 0);
export const candidateKey = ids => [...ids].sort().join('|');
const titularOf = id => SAME_PARTY_REPORTS[id] ?? id;

function withPartyReports(poll) {
  const ids = Object.keys(poll.scores ?? {});
  if (!ids.some(id => id in SAME_PARTY_REPORTS)) return poll;
  const scores = {};
  for (const id of ids) scores[titularOf(id)] = (scores[titularOf(id)] ?? 0) + poll.scores[id];
  return { ...poll, scores };
}

const reportedPolls = data => (data.polls ?? []).map(withPartyReports);

// Prix d'un marché par titulaire : les chances d'un même parti s'additionnent, ou la meilleure compte (bulletin).
function reportedPrices(markets, combine = (a, b) => Math.min(100, a + b)) {
  const prices = {};
  for (const market of markets ?? []) {
    if (!Number.isFinite(market.probability) || market.probability < 0 || market.probability > 100) continue;
    const titular = titularOf(market.id);
    prices[titular] = titular in prices ? combine(prices[titular], market.probability) : market.probability;
  }
  return prices;
}

export function normalizeWeights(input = DEFAULT_WEIGHTS) {
  const weights = Object.fromEntries(SOURCE_IDS.map(key => {
    const value = Number(input?.[key]);
    return [key, Number.isFinite(value) ? Math.round(clamp(value, 0, 100)) : 0];
  }));
  weights.polls = Math.max(MIN_POLL_WEIGHT, weights.polls);
  return weights;
}

// Part de chaque source disponible dans l'influence totale, en pourcentage.
export function sourceShares(weights, available = SOURCE_IDS) {
  const normalized = normalizeWeights(weights);
  const active = SOURCE_IDS.filter(key => key === 'polls' || available.includes(key));
  const total = sum(active.map(key => normalized[key]));
  return Object.fromEntries(SOURCE_IDS.map(key => [key, active.includes(key) ? normalized[key] * 100 / total : 0]));
}

export function settingsFrom(input = {}) {
  const finite = (key, fallback) => Number.isFinite(Number(input[key])) ? Number(input[key]) : fallback;
  return {
    halfLife: clamp(finite('halfLife', DEFAULT_SETTINGS.halfLife), 3, 90),
    weights: normalizeWeights(input.weights ?? DEFAULT_WEIGHTS),
    uncertainty: clamp(finite('uncertainty', DEFAULT_SETTINGS.uncertainty), 0, 8),
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
  for (const poll of reportedPolls(data)) {
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
  return reportedPolls(data).filter(p => p.round === 1 && validPoll(p, asOf) &&
    candidateKey(Object.keys(p.scores)) === configurationId && daysBetween(asOf, p.fieldEnd) <= 120);
}

export function aggregatePolls(polls, candidateIds, asOf, halfLife = DEFAULT_SETTINGS.halfLife) {
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

function firstRoundPolls(data, asOf) {
  return reportedPolls(data).filter(p => p.round === 1 && validPoll(p, asOf) && daysBetween(asOf, p.fieldEnd) <= POLL_WINDOW_DAYS);
}

// Chaque liste testée devient une observation. Les listes d'une même enquête partagent ses répondants,
// et les instituts les plus fréquents sont atténués.
function pollObservations(polls, asOf, halfLife) {
  const surveys = new Map();
  for (const poll of polls) surveys.set(poll.id, { institute: poll.institute, lists: (surveys.get(poll.id)?.lists ?? 0) + 1 });
  const instituteCounts = new Map();
  for (const survey of surveys.values()) instituteCounts.set(survey.institute, (instituteCounts.get(survey.institute) ?? 0) + 1);
  return polls.map(poll => {
    const ids = Object.keys(poll.scores);
    const total = sum(ids.map(id => poll.scores[id]));
    const age = Math.max(0, daysBetween(asOf, poll.fieldEnd));
    const weight = Math.pow(0.5, age / halfLife) * Math.sqrt(clamp(poll.sampleSize || 1000, 100, 5000) / 1000) /
      Math.sqrt(instituteCounts.get(poll.institute) * surveys.get(poll.id).lists);
    return { ids, weight, institute: poll.institute, shares: Object.fromEntries(ids.map(id => [id, poll.scores[id] / total])) };
  });
}

// Modèle de choix : part d'une option = son soutien ÷ somme des soutiens des options présentes.
// Ajustement par l'algorithme itératif MM (Hunter, 2004).
function fitChoice(observations) {
  const options = [...new Set(observations.flatMap(item => item.ids))];
  const earned = Object.fromEntries(options.map(id => [id, 0]));
  for (const item of observations) for (const id of item.ids) earned[id] += item.weight * item.shares[id];
  let support = Object.fromEntries(options.map(id => [id, 1 / options.length]));
  for (let iteration = 0; iteration < FIT_MAX_ITERATIONS; iteration++) {
    const exposure = Object.fromEntries(options.map(id => [id, 0]));
    for (const item of observations) {
      const listTotal = sum(item.ids.map(id => support[id]));
      for (const id of item.ids) exposure[id] += item.weight / listTotal;
    }
    const raw = options.map(id => Math.max(earned[id] / exposure[id], 1e-9));
    const total = sum(raw);
    const next = Object.fromEntries(options.map((id, index) => [id, raw[index] / total]));
    const change = Math.max(...options.map(id => Math.abs(next[id] - support[id]) / support[id]));
    support = next;
    if (change < FIT_TOLERANCE) break;
  }
  return support;
}

function blocResolver(data) {
  const party = Object.fromEntries((data.candidates ?? []).map(candidate => [candidate.id, candidate.party]));
  return id => POLITICAL_BLOCS[party[id]] ?? id;
}

// Deux niveaux : le poids de chaque camp, puis la répartition à l'intérieur du camp. Ajouter un candidat
// de gauche divise donc surtout la gauche, sans retirer mécaniquement des voix à l'extrême droite.
export function fitSupport(data, asOf = data.asOf, halfLife = DEFAULT_SETTINGS.halfLife) {
  const polls = firstRoundPolls(data, asOf);
  if (!polls.length) return null;
  const blocOf = blocResolver(data);
  const observations = pollObservations(polls, asOf, halfLife);
  const blocObservations = [];
  const insideBlocs = new Map();
  for (const item of observations) {
    const totals = {};
    for (const id of item.ids) totals[blocOf(id)] = (totals[blocOf(id)] ?? 0) + item.shares[id];
    blocObservations.push({ ids: Object.keys(totals), weight: item.weight, shares: totals });
    for (const [bloc, total] of Object.entries(totals)) {
      if (!(total > 0)) continue;
      const ids = item.ids.filter(id => blocOf(id) === bloc);
      const inside = { ids, weight: item.weight * total, shares: Object.fromEntries(ids.map(id => [id, item.shares[id] / total])) };
      insideBlocs.set(bloc, [...(insideBlocs.get(bloc) ?? []), inside]);
    }
  }
  const blocSupport = fitChoice(blocObservations);
  const within = {};
  for (const insideObservations of insideBlocs.values()) Object.assign(within, fitChoice(insideObservations));
  const candidates = Object.keys(within);
  const surveysById = {};
  for (const id of candidates) surveysById[id] = new Set(polls.filter(poll => id in poll.scores).map(poll => poll.id)).size;
  return { support: Object.fromEntries(candidates.map(id => [id, blocSupport[blocOf(id)] * within[id]])), blocSupport, within, blocOf, surveysById, observations,
    pollCount: new Set(polls.map(poll => poll.id)).size, instituteCount: new Set(polls.map(poll => poll.institute)).size,
    latest: polls.map(poll => poll.fieldEnd).sort().at(-1) };
}

function scoresForList(fit, ids) {
  const known = ids.filter(id => Number.isFinite(fit.within[id]));
  const blocs = [...new Set(known.map(fit.blocOf))];
  const blocTotal = sum(blocs.map(bloc => fit.blocSupport[bloc]));
  if (!(blocTotal > 0)) return null;
  const withinTotals = Object.fromEntries(blocs.map(bloc => [bloc, sum(known.filter(id => fit.blocOf(id) === bloc).map(id => fit.within[id]))]));
  return Object.fromEntries(known.map(id => {
    const bloc = fit.blocOf(id);
    return [id, 100 * fit.blocSupport[bloc] / blocTotal * fit.within[id] / withinTotals[bloc]];
  }));
}

const standardDeviation = values => {
  const mean = sum(values) / values.length;
  return Math.sqrt(sum(values.map(value => (value - mean) ** 2)) / values.length);
};

function samplingSpread(score) {
  const share = clamp(score / 100, 0, 1);
  return 100 * Math.sqrt(share * (1 - share) / REFERENCE_SAMPLE);
}

// Précision de la moyenne des sondages pour chaque candidat : écart observé entre les listes testées et le modèle,
// réduit par le nombre effectif d'instituts (les listes d'un même institut ne sont pas indépendantes).
// Sans écart mesurable, l'aléa de sondage seul.
function pollPrecisions(fit, ids, scores) {
  const predictions = fit.observations.map(item => scoresForList(fit, item.ids));
  return Object.fromEntries(ids.map(id => {
    const byInstitute = new Map();
    let weight = 0;
    let squared = 0;
    let count = 0;
    fit.observations.forEach((item, index) => {
      const predicted = predictions[index]?.[id];
      if (!item.ids.includes(id) || !(predicted > 0)) return;
      weight += item.weight;
      byInstitute.set(item.institute, (byInstitute.get(item.institute) ?? 0) + item.weight);
      squared += item.weight * ((item.shares[id] * 100 - predicted) / predicted) ** 2;
      count++;
    });
    const effective = weight > 0 ? weight ** 2 / sum([...byInstitute.values()].map(value => value ** 2)) : 1;
    const observed = count >= MIN_POLLS_FOR_SPREAD ? Math.sqrt(squared / weight) * scores[id] : 0;
    return [id, Math.max(observed, samplingSpread(scores[id])) / Math.sqrt(effective)];
  }));
}

function valuesOverMemory(series, asOf, days) {
  const first = new Date(Date.parse(asOf) - days * DAY).toISOString().slice(0, 10);
  return Object.entries(series ?? {}).filter(([day]) => day >= first && day <= asOf).sort().map(([, value]) => value);
}

// Prix de victoire du titulaire et des candidats de son parti, additionnés jour par jour.
function reportedMarketSeries(history, id) {
  const series = {};
  for (const [candidate, values] of Object.entries(history ?? {})) {
    if (titularOf(candidate) !== id) continue;
    for (const [day, price] of Object.entries(values)) series[day] = (series[day] ?? 0) + price;
  }
  return series;
}

const dailyChanges = levels => levels.slice(1).map((value, index) => value - levels[index]);
// Une évolution régulière a des variations quotidiennes constantes : seul l'irrégulier compte comme du bruit.
const irregularity = changes => changes.length >= 2 ? standardDeviation(changes) : 0;

// Incertitude en points par candidat, entièrement mesurée : précision des sondages et bruit de chaque source utilisée
// sur la mémoire des sondages. Ces parts indépendantes se combinent en somme quadratique, sans borne fixée à la main.
function campaignUncertainty(data, ids, fit, scores, halfLife, strengths, targets) {
  const days = Math.max(2, Math.round(halfLife));
  const polls = pollPrecisions(fit, ids, scores);
  return Object.fromEntries(ids.map(id => {
    const prices = valuesOverMemory(reportedMarketSeries(data.history?.polymarket, id), data.asOf, days).map(price => Math.log(price / 100 + MARKET_FLOOR));
    const views = valuesOverMemory(data.history?.wikipedia?.[id], data.asOf, days).filter(count => count > 0).map(Math.log);
    const followers = valuesOverMemory(data.history?.barometer?.[id], data.asOf, days);
    const parts = {
      polls: polls[id],
      // Une variation de prix déplace la cible du marché, retenue selon la force de Polymarket.
      polymarket: targets[id] * irregularity(dailyChanges(prices)) * strengths.polymarket,
      // Les variations quotidiennes d'abonnés s'accumulent sur la période.
      barometer: scores[id] * (followers.length >= 2 ? standardDeviation(followers) : 0) * Math.sqrt(days) / 1000 * strengths.barometer,
      // Le signal Wikipédia est une médiane : son bruit diminue avec le nombre de jours.
      wikipedia: scores[id] * (views.length >= 2 ? 1.25 * standardDeviation(views) / Math.sqrt(views.length) : 0) * strengths.wikipedia,
    };
    return [id, { ...parts, base: Math.hypot(...Object.values(parts)) }];
  }));
}

function marketPrices(data, source, combine) {
  return recent(data.asOf, source?.capturedAt, 7) ? reportedPrices(source.markets, combine) : null;
}

export function eligibleCandidates(data, fit) {
  const candidates = Object.keys(fit.support);
  const ballot = marketPrices(data, data.marketEvents?.ballot, Math.max);
  const victory = marketPrices(data, data.market);
  if (!ballot && !victory) return candidates.filter(id => fit.surveysById[id] >= MIN_SURVEYS_WITHOUT_MARKET);
  return candidates.filter(id => (ballot?.[id] ?? 0) >= MIN_BALLOT_PRICE || (victory?.[id] ?? 0) >= MIN_WIN_PRICE);
}

// La liste complète reconstruite, proposée par défaut, puis chaque liste réellement testée.
export function allConfigurations(data) {
  const lists = listConfigurations(data);
  const fit = fitSupport(data);
  if (!fit) return lists;
  const candidateIds = eligibleCandidates(data, fit).sort();
  if (candidateIds.length < 2) return lists;
  const field = { id: FIELD_ID, isField: true, candidateIds, pollCount: fit.pollCount, latest: fit.latest,
    example: { scores: scoresForList(fit, candidateIds), main: true } };
  return [field, ...lists];
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

// Chaque marché Polymarket décrit un événement de la simulation : la liste renvoyée donne les candidats
// concernés par une trajectoire (vainqueur, 1re, 2e, 3e place, qualifiés).
const MARKET_BOARDS = Object.freeze({
  president: { label: 'Victoire finale', concerned: draw => draw.winner === null ? [] : [draw.winner] },
  winner: { label: 'Vainqueur du premier tour', concerned: draw => [draw.first] },
  second: { label: 'Deuxième place', concerned: draw => [draw.second] },
  third: { label: 'Troisième place', concerned: draw => draw.third === undefined ? [] : [draw.third] },
  advance: { label: 'Qualification au second tour', concerned: draw => [draw.first, draw.second] },
});

// Dernier terrain où chaque candidat a été testé : point de départ de ses dynamiques.
function latestFieldDates(data) {
  const latest = {};
  for (const poll of firstRoundPolls(data, data.asOf)) {
    for (const id of Object.keys(poll.scores)) if (!(id in latest) || poll.fieldEnd > latest[id]) latest[id] = poll.fieldEnd;
  }
  return latest;
}

function dynamicsSinceLastPoll(windows, ids, latest, isUsable) {
  const periods = {};
  const anchors = {};
  for (const id of ids) {
    const signal = windows?.[latest[id]]?.signals?.[id];
    if (signal && isUsable(signal)) {
      periods[id] = signal;
      anchors[id] = latest[id];
    }
  }
  const observed = ids.filter(id => id in periods);
  return { periods, anchors, observed, missing: ids.filter(id => !observed.includes(id)), anchor: Object.values(anchors).sort().at(-1) };
}

export function sourceComponents(data, ids) {
  const latest = latestFieldDates(data);
  const components = {
    polls: { available: ids.some(id => id in latest), latest: ids.map(id => latest[id]).filter(Boolean).sort().at(-1),
      reason: 'Socle électoral : tous les sondages de premier tour, toutes listes confondues, ramenés à des niveaux de soutien cohérents.' },
    barometer: { available: false, reason: 'Deux candidats avec une dynamique mesurable depuis le dernier terrain, sur au moins deux plateformes récentes, sont nécessaires.' },
    polymarket: { available: false, reason: 'Deux candidats cotés et une capture de moins de 7 jours sont nécessaires.' },
    wikipedia: { available: false, reason: 'Moins de deux candidats avec assez de consultations Wikipédia autour du dernier terrain, ou relevé de plus de 3 jours.' },
    trends: { available: false, reason: 'aucun candidat de cette liste dans les recherches en forte hausse des 28 derniers jours.' },
  };
  if (recent(data.asOf, data.social?.asOf, 3)) {
    const dynamics = dynamicsSinceLastPoll(data.social.windows, ids, latest, signal => signal.coverage >= 2 && Number.isFinite(signal.score));
    if (dynamics.observed.length >= 2) components.barometer = { ...dynamics, available: true, latest: data.social.asOf,
      raw: Object.fromEntries(dynamics.observed.map(id => [id, dynamics.periods[id].score])),
      reason: 'Dynamique pondérée depuis le dernier sondage de chaque candidat, en ‰, appliquée en bonus ou malus relatif. Une dynamique proche de zéro n’a pas d’effet ; une perte d’abonnés tire vers le bas.' };
  }
  const boards = {};
  const boardSources = { president: data.market, ...(data.marketEvents ?? {}) };
  for (const key of Object.keys(MARKET_BOARDS)) {
    const source = boardSources[key];
    if (!recent(data.asOf, source?.capturedAt, 7)) continue;
    const allPrices = reportedPrices(source.markets);
    const prices = Object.fromEntries(ids.filter(id => id in allPrices).map(id => [id, allPrices[id]]));
    if (Object.keys(prices).length >= 2 && sum(Object.values(prices)) > 0) boards[key] = { prices, latest: source.capturedAt.slice(0, 10) };
  }
  if (Object.keys(boards).length) components.polymarket = { available: true, boards, prices: boards.president?.prices ?? {},
    latest: Object.values(boards).map(board => board.latest).sort().at(-1),
    reason: 'Anticipations des marchés (victoire finale, vainqueur du premier tour, deuxième et troisième place, qualification). Bonus ou malus avant les simulations selon l’écart entre le marché et le modèle, puis correction des qualifications et des victoires.' };
  if (recent(data.asOf, data.wikipedia?.asOf, 3)) {
    const dynamics = dynamicsSinceLastPoll(data.wikipedia.windows, ids, latest, signal => Number.isFinite(signal.dynamic));
    if (dynamics.observed.length >= 2) components.wikipedia = { ...dynamics, available: true, latest: data.wikipedia.asOf,
      raw: Object.fromEntries(dynamics.observed.map(id => [id, dynamics.periods[id].dynamic])),
      reason: 'Dynamique des consultations Wikipédia depuis le dernier sondage de chaque candidat (médianes, pics d’un jour neutralisés), appliquée en bonus ou malus relatif. Une consultation peut traduire un soutien, une polémique ou de la curiosité.' };
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
// L'influence est partagée entre les marchés actifs : ils se recoupent, ils ne s'additionnent pas.
function marketBoards(ids, trajectories, component, influence) {
  const neutral = Object.fromEntries(ids.map(id => [id, 1]));
  const inactive = reason => ({ fusion: { active: false, factors: neutral, compared: [], excluded: ids, boards: [], reason }, weightOf: () => 1 });
  if (!component.available || !influence) return inactive(!influence ? 'Influence du marché réglée à zéro.' : 'Aucun marché exploitable pour cette liste.');
  const prepared = POST_SIMULATION_BOARDS.flatMap(key => {
    const board = MARKET_BOARDS[key];
    const prices = component.boards?.[key]?.prices;
    if (!prices) return [];
    const frequency = Object.fromEntries(ids.map(id => [id, 0]));
    for (const draw of trajectories) for (const index of board.concerned(draw)) frequency[ids[index]]++;
    const compared = ids.filter(id => frequency[id] >= 10 && Number.isFinite(prices[id]));
    const marketTotal = sum(compared.map(id => prices[id]));
    return [{ key, board, prices, frequency, compared, marketTotal, active: compared.length >= 2 && marketTotal > 0 }];
  });
  const active = prepared.filter(item => item.active);
  if (!active.length) return inactive('Pas assez de candidats cotés et simulés : aucun effet forcé du marché.');
  const exponent = influence / active.length;
  for (const item of active) {
    const total = sum(item.compared.map(id => item.frequency[id]));
    item.marketShares = Object.fromEntries(item.compared.map(id => [id, item.prices[id] / item.marketTotal]));
    item.modelShares = Object.fromEntries(item.compared.map(id => [id, item.frequency[id] / total]));
    const raw = Object.fromEntries(item.compared.map(id => [id, Math.pow(clamp(item.marketShares[id] / item.modelShares[id], 0.05, 20), exponent)]));
    const average = sum(item.compared.map(id => item.frequency[id] * raw[id])) / total;
    item.factors = Object.fromEntries(ids.map(id => [id, item.compared.includes(id) ? raw[id] / average : 1]));
  }
  const weightOf = draw => active.reduce((weight, item) => {
    const concerned = item.board.concerned(draw);
    if (!concerned.length) return weight;
    return weight * Math.exp(sum(concerned.map(index => Math.log(item.factors[ids[index]]))) / concerned.length);
  }, 1);
  const lead = active.find(item => item.key === 'president') ?? active[0];
  const compared = ids.filter(id => active.some(item => item.compared.includes(id)));
  return { weightOf, fusion: { active: true, factors: lead.factors, compared, excluded: ids.filter(id => !compared.includes(id)),
    marketShares: lead.marketShares, modelShares: lead.modelShares,
    boards: prepared.map(({ key, board, active: isActive, compared: list }) => ({ id: key, label: board.label, active: isActive, compared: list })),
    reason: `${active.length} marché${active.length > 1 ? 's' : ''} comparé${active.length > 1 ? 's' : ''} aux fréquences simulées, uniquement entre candidats cotés et simulés au moins 10 fois. Rapport plafonné entre 0,05 et 20, élevé à l’influence de Polymarket partagée entre les marchés actifs ; masse totale conservée.` } };
}

export function runoffEstimates(data, ids, settings = DEFAULT_SETTINGS) {
  const groups = new Map();
  for (const poll of reportedPolls(data)) {
    const candidates = Object.keys(poll.scores ?? {});
    if (poll.round !== 2 || candidates.length !== 2 || !candidates.every(id => ids.includes(id)) ||
      !validPoll(poll, data.asOf) || daysBetween(data.asOf, poll.fieldEnd) > 120) continue;
    const key = candidateKey(candidates);
    const records = groups.get(key) ?? [];
    records.push(poll);
    groups.set(key, records);
  }
  return Object.fromEntries([...groups].map(([key, polls]) => {
    const candidateIds = key.split('|');
    const estimate = aggregatePolls(polls, candidateIds, data.asOf, settings.halfLife);
    const observed = polls.length >= MIN_POLLS_FOR_SPREAD ? standardDeviation(polls.map(poll => poll.scores[candidateIds[0]])) : 0;
    const spread = Math.max(observed, samplingSpread(estimate.scores[candidateIds[0]])) / Math.sqrt(estimate.instituteCount);
    return [key, { ...estimate, candidateIds, spread }];
  }));
}

// Score vers lequel le marché tire chaque candidat : ses parts sur les marchés, ramenées aux points en jeu,
// sans dépasser son prix de victoire (sauf si les sondages le placent déjà plus haut).
function marketTargets(ids, scores, component) {
  const weighted = Object.fromEntries(ids.map(id => [id, 0]));
  const weights = Object.fromEntries(ids.map(id => [id, 0]));
  const used = [];
  for (const level of MARKET_BASE_LEVELS) {
    const boards = level.boards.map(key => component.boards?.[key]?.prices);
    if (boards.some(prices => !prices)) continue;
    const prices = Object.fromEntries(ids.map(id => [id, sum(boards.map(board => board[id] ?? 0))]));
    const compared = ids.filter(id => boards.some(board => Number.isFinite(board[id])));
    const marketTotal = sum(compared.map(id => prices[id]));
    const pollTotal = sum(compared.map(id => scores[id]));
    if (compared.length < 2 || !(marketTotal > 0) || !(pollTotal > 0)) continue;
    for (const id of compared) {
      weighted[id] += level.weight * prices[id] / marketTotal * pollTotal;
      weights[id] += level.weight;
    }
    used.push(level.key);
  }
  const victory = component.boards?.president?.prices ?? {};
  const ceilings = Object.fromEntries(ids.filter(id => Number.isFinite(victory[id])).map(id => [id, Math.max(scores[id], victory[id])]));
  const targets = Object.fromEntries(ids.map(id => {
    const target = weights[id] ? weighted[id] / weights[id] : scores[id];
    return [id, id in ceilings ? Math.min(target, ceilings[id]) : target];
  }));
  return { boards: used, targets, ceilings };
}

// Plafonne les scores en redistribuant l'excédent aux autres candidats, total conservé à 100.
function applyCeilings(ids, centers, ceilings) {
  const values = [...centers];
  for (let pass = 0; pass < ids.length; pass++) {
    const excess = sum(values.map((value, index) => Math.max(0, value - (ceilings[ids[index]] ?? Infinity))));
    if (excess < 1e-9) break;
    const free = values.map((value, index) => value < (ceilings[ids[index]] ?? Infinity) ? value : 0);
    const freeTotal = sum(free);
    if (!(freeTotal > 0)) break;
    values.forEach((value, index) => {
      const ceiling = ceilings[ids[index]] ?? Infinity;
      values[index] = value >= ceiling ? ceiling : value + excess * value / freeTotal;
    });
  }
  return values;
}

// Déplacement de chaque duel selon l'écart entre le prix de victoire et la fréquence de victoire simulée.
function marketDuelShifts(ids, draws, prices, duels, scale) {
  if (!prices) return {};
  const wins = Object.fromEntries(ids.map(id => [id, 0]));
  for (const draw of draws) if (draw.winner !== null) wins[ids[draw.winner]]++;
  const compared = ids.filter(id => Number.isFinite(prices[id]));
  const marketTotal = sum(compared.map(id => prices[id]));
  const winTotal = sum(compared.map(id => wins[id]));
  if (compared.length < 2 || !(marketTotal > 0) || !(winTotal > 0)) return {};
  const gap = id => compared.includes(id)
    ? Math.log((prices[id] / marketTotal + MARKET_FLOOR) / (wins[id] / winTotal + MARKET_FLOOR))
    : 0;
  return Object.fromEntries(Object.entries(duels).map(([key, duel]) => {
    const [first, second] = duel.candidateIds;
    return [key, (gap(first) - gap(second)) * scale * DUEL_MARKET_UNIT];
  }));
}

function shiftedDuelScore(score, shift) {
  const share = clamp(score / 100, 0.01, 0.99);
  return 100 / (1 + Math.exp(-(Math.log(share / (1 - share)) + shift)));
}

const ignoreNoise = (value, threshold) => Math.sign(value) * Math.max(0, Math.abs(value) - threshold);
// Proche de la valeur brute pour les variations courantes, comprimé en douceur pour les très grosses.
const relativeEffect = value => Math.exp(DYNAMIC_SATURATION * Math.tanh(value / DYNAMIC_SATURATION)) - 1;

export function forecast(data, configurationId, rawSettings = {}) {
  const settings = settingsFrom(rawSettings);
  const configurations = allConfigurations(data);
  const configuration = configurations.find(c => c.id === configurationId) ?? configurations[0];
  if (!configuration) return { error: 'Aucune configuration de premier tour exploitable.', rows: [], settings };
  const ids = configuration.candidateIds;
  const fit = fitSupport(data, data.asOf, settings.halfLife);
  const scores = fit && scoresForList(fit, ids);
  if (!scores || ids.some(id => !Number.isFinite(scores[id]))) return { error: `Aucun sondage compatible depuis ${POLL_WINDOW_DAYS} jours.`, rows: [], settings, configuration };
  const baseline = { scores, pollCount: fit.pollCount, instituteCount: fit.instituteCount, latest: fit.latest };
  const components = sourceComponents(data, ids);
  const available = SOURCE_IDS.filter(id => components[id].available);
  const shares = sourceShares(settings.weights, available);
  const sourceMix = Object.fromEntries(SOURCE_IDS.map(id => [id, { ...components[id], requested: settings.weights[id], effective: shares[id] }]));

  // Chaque dynamique agit relativement au propre score sondé : multiplicateur direct pour le baromètre
  // et Wikipédia, part d'influence pour Google Trends.
  const scales = {
    barometer: components.barometer.available ? sourceMultiplier(settings.weights, 'barometer') : 0,
    wikipedia: components.wikipedia.available ? sourceMultiplier(settings.weights, 'wikipedia') * WIKIPEDIA_UNIT : 0,
    trends: shares.trends / 100,
  };
  const signals = {
    barometer: id => ignoreNoise(components.barometer.raw?.[id] ?? 0, BAROMETER_NOISE) / 1000,
    wikipedia: id => ignoreNoise(components.wikipedia.raw?.[id] ?? 0, WIKIPEDIA_NOISE),
    trends: id => components.trends.values?.[id] ?? 0,
  };
  const relativeBoost = (source, id) => scales[source] ? relativeEffect(signals[source](id) * scales[source]) : 0;
  const corrections = Object.fromEntries(ids.map(id => [id,
    Object.fromEntries(DYNAMIC_IDS.map(source => [source, baseline.scores[id] * relativeBoost(source, id)]))]));
  const duels = runoffEstimates(data, ids, settings);
  const meta = Object.fromEntries((data.candidates ?? []).map(c => [c.id, c]));
  // Polymarket avant les simulations : bonus ou malus selon l'écart entre ses prix et les sondages.
  const marketScale = components.polymarket.available ? MARKET_UNIT * shares.polymarket / 100 : 0;
  const simulate = (centerValues, count, duelShifts = {}) => {
    const normal = normalGenerator(makeRandom());
    const draws = [];
    for (let iteration = 0; iteration < count; iteration++) {
      const families = new Map();
      const raw = centerValues.map((center, index) => {
        const family = meta[ids[index]]?.family ?? ids[index];
        if (!families.has(family)) families.set(family, normal());
        const spread = Math.hypot(uncertainty[ids[index]].base, settings.uncertainty * Math.sqrt(Math.max(center, 1) / 25));
        return Math.max(0.02, center + spread * (0.55 * families.get(family) + Math.sqrt(1 - 0.55 ** 2) * normal()));
      });
      const total = sum(raw);
      const scores = raw.map(x => x * 100 / total);
      const [first, second, third] = ids.map((_, index) => index).sort((a, b) => scores[b] - scores[a]);
      const key = scores[first] > 50 ? null : candidateKey([ids[first], ids[second]]);
      const duel = key ? duels[key] : null;
      let winner = key ? null : first;
      let runoff = null;
      if (duel) {
        // Score simulé du premier qualifié au second tour, tiré autour de la moyenne des sondages du duel.
        // Les sources déplacent le score attendu du duel et peuvent le faire basculer.
        const pollScore = duel.scores[ids[first]];
        const direction = ids[first] === duel.candidateIds[0] ? 1 : -1;
        const expected = shiftedDuelScore(pollScore, (duelShifts[key] ?? 0) * direction);
        runoff = clamp(expected + normal() * Math.hypot(duel.spread, settings.uncertainty), 0, 100);
        winner = runoff > 50 ? first : second;
      }
      draws.push({ scores, first, second, third, winner, key, runoff });
    }
    return draws;
  };
  const totalCorrection = id => sum(Object.values(corrections[id]));
  const currentCenters = () => {
    const raw = ids.map(id => Math.max(0.05, baseline.scores[id] + totalCorrection(id)));
    return raw.map(value => value * 100 / sum(raw));
  };

  // Polymarket avant les simulations : le score est tiré vers la cible du marché. À part maximale, il l'atteint.
  const marketBlend = marketScale ? 1 - (1 - shares.polymarket / 100) ** 2 : 0;
  const marketBonus = marketScale
    ? { ...marketTargets(ids, baseline.scores, components.polymarket), blend: marketBlend }
    : { boards: [], targets: { ...baseline.scores }, ceilings: {}, blend: 0 };
  for (const id of ids) corrections[id].polymarket = marketBlend * (marketBonus.targets[id] - baseline.scores[id]);
  const uncertainty = campaignUncertainty(data, ids, fit, baseline.scores, settings.halfLife,
    { polymarket: marketBlend, barometer: scales.barometer, wikipedia: scales.wikipedia }, marketBonus.targets);
  const centers = applyCeilings(ids, currentCenters(), marketBonus.ceilings);
  // Dans les duels : le prix de victoire face à une première simulation, et l'élan du baromètre et de Wikipédia.
  const marketShifts = marketScale
    ? marketDuelShifts(ids, simulate(centers, Math.min(DUEL_PRE_SIMULATIONS, settings.simulations)), components.polymarket.boards?.president?.prices, duels, marketScale)
    : {};
  const momentum = id => {
    const score = baseline.scores[id];
    return score > 0 ? Math.log(Math.max(0.05, score + sum(DYNAMIC_IDS.map(source => corrections[id][source]))) / score) : 0;
  };
  const duelShifts = Object.fromEntries(Object.entries(duels)
    .map(([key, duel]) => [key, (marketShifts[key] ?? 0) + momentum(duel.candidateIds[0]) - momentum(duel.candidateIds[1])])
    .filter(([, shift]) => shift !== 0));
  const trajectories = simulate(centers, settings.simulations, duelShifts);

  const { fusion: marketFusion, weightOf } = marketBoards(ids, trajectories, components.polymarket, shares.polymarket / 100);
  const counts = ids.map(() => ({ topTwo: 0, wins: 0, unknown: 0, total: 0, samples: [], runoffSamples: [] }));
  const pairCounts = new Map();
  const pairSamples = new Map();
  let totalWeight = 0, squaredWeight = 0, unresolved = 0;
  for (const draw of trajectories) {
    const weight = weightOf(draw);
    totalWeight += weight; squaredWeight += weight ** 2;
    draw.scores.forEach((value, index) => { counts[index].samples.push([value, weight]); counts[index].total += value * weight; });
    counts[draw.first].topTwo += weight; counts[draw.second].topTwo += weight;
    if (draw.key) pairCounts.set(draw.key, (pairCounts.get(draw.key) ?? 0) + weight);
    if (draw.runoff !== null) {
      const leading = duels[draw.key].candidateIds[0];
      const samples = pairSamples.get(draw.key) ?? [];
      samples.push([ids[draw.first] === leading ? draw.runoff : 100 - draw.runoff, weight]);
      pairSamples.set(draw.key, samples);
      counts[draw.first].runoffSamples.push([draw.runoff, weight]);
      counts[draw.second].runoffSamples.push([100 - draw.runoff, weight]);
    }
    if (draw.winner === null) { unresolved += weight; counts[draw.first].unknown += weight; counts[draw.second].unknown += weight; }
    else counts[draw.winner].wins += weight;
  }
  const rows = ids.map((id, index) => {
    const result = counts[index];
    result.samples.sort((a, b) => a[0] - b[0]);
    return { id, name: meta[id]?.name ?? id, party: meta[id]?.party ?? '', color: meta[id]?.color ?? '#687b81', photo: meta[id]?.photo ?? null,
      pollScore: baseline.scores[id], center: centers[index], corrections: corrections[id], renormalization: centers[index] - baseline.scores[id] - totalCorrection(id),
      score: result.total / totalWeight, lower: weightedQuantile(result.samples, 0.05, totalWeight), upper: weightedQuantile(result.samples, 0.95, totalWeight),
      uncertainty: uncertainty[id], qualification: result.topTwo / totalWeight * 100, winLower: result.wins / totalWeight * 100, winUpper: (result.wins + result.unknown) / totalWeight * 100,
      runoff: summarizeRunoff(result.runoffSamples, result.topTwo) };
  }).sort((a, b) => b.score - a.score);
  return { modelVersion: MODEL_VERSION, settings, configuration, baseline, rows, sourceMix,
    marketBonus, duelShifts, adjustmentLimits: { marketScale, barometerScale: scales.barometer, wikipediaScale: sourceMultiplier(settings.weights, 'wikipedia'), trendsScale: scales.trends },
    marketFusion: { ...marketFusion, effectiveSampleSize: totalWeight ** 2 / squaredWeight },
    unresolved: unresolved / totalWeight * 100,
    pairs: [...pairCounts].map(([key, count]) => ({ key, probability: count / totalWeight * 100, estimate: duels[key] ?? null, projection: duelProjection(key, pairSamples.get(key)) })).sort((a, b) => b.probability - a.probability),
    isPersonal: settings.halfLife !== DEFAULT_SETTINGS.halfLife || settings.uncertainty !== DEFAULT_SETTINGS.uncertainty || SOURCE_IDS.some(id => settings.weights[id] !== DEFAULT_WEIGHTS[id]), experimental: true };
}

// Score projeté de chaque finaliste dans un duel précis, avec son intervalle à 90 %.
function duelProjection(key, samples) {
  const summary = summarizeRunoff(samples ?? [], 1);
  if (!summary) return null;
  const [first, second] = key.split('|');
  return {
    scores: { [first]: summary.score, [second]: 100 - summary.score },
    lower: { [first]: summary.lower, [second]: 100 - summary.upper },
    upper: { [first]: summary.upper, [second]: 100 - summary.lower },
  };
}

// Score moyen au second tour lorsque le candidat est qualifié dans un duel sondé.
function summarizeRunoff(samples, qualifiedWeight) {
  const weight = sum(samples.map(([, sampleWeight]) => sampleWeight));
  if (!weight) return null;
  samples.sort((a, b) => a[0] - b[0]);
  return {
    score: sum(samples.map(([value, sampleWeight]) => value * sampleWeight)) / weight,
    lower: weightedQuantile(samples, 0.05, weight),
    upper: weightedQuantile(samples, 0.95, weight),
    coverage: qualifiedWeight > 0 ? weight / qualifiedWeight * 100 : 0,
  };
}

export function pollingHistory(data, configurationId, halfLife = DEFAULT_SETTINGS.halfLife) {
  const ids = configurationId === FIELD_ID
    ? allConfigurations(data).find(item => item.id === FIELD_ID)?.candidateIds ?? []
    : configurationId.split('|');
  const dates = [...new Set(firstRoundPolls(data, data.asOf)
    .filter(poll => ids.filter(id => id in poll.scores).length >= 2)
    .map(poll => poll.fieldEnd))].sort();
  return dates.flatMap(date => {
    const fit = fitSupport(data, date, halfLife);
    const scores = fit && scoresForList(fit, ids);
    return scores ? [{ date, scores }] : [];
  });
}
