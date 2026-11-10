// Prix Polymarket du moment, lus au chargement de la page.
// Le relevé de la nuit reste la référence archivée : il est conservé pour chaque tableau
// que l'API ne renvoie pas, et pour tous si elle ne répond pas à temps.
// Même lecture que pipeline/sources.py (parse_market), pour que le modèle reçoive les mêmes champs.

const GAMMA_EVENTS = 'https://gamma-api.polymarket.com/events?slug=';
const TIMEOUT_MS = 6000;

// Clé du tableau dans les données, événement Polymarket, titre affiché.
export const LIVE_BOARDS = Object.freeze([
  { key: 'president', slug: 'next-french-presidential-election', title: null },
  { key: 'winner', slug: 'french-presidential-election-first-round-winner', title: 'Vainqueur du premier tour' },
  { key: 'second', slug: 'french-presidential-election-first-round-2nd-place', title: 'Deuxième place du premier tour' },
  { key: 'third', slug: 'french-presidential-election-first-round-3rd-place', title: 'Troisième place du premier tour' },
  { key: 'advance', slug: 'next-french-presidential-election-who-will-advance-to-the-2nd-round', title: 'Qualification au second tour' },
  { key: 'ballot', slug: '2027-french-presidential-election-who-will-be-on-the-ballot', title: 'Présence sur le bulletin de vote' },
]);

// Lignes de remplissage de Polymarket (« Candidate A », « Other ») : jamais un vrai candidat.
const PLACEHOLDER = /^(candidate [a-z]+|other|autre)$/i;

function slug(value) {
  return value
    .toLocaleLowerCase('fr')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function number(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseList(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function yesPrice(market) {
  try {
    const outcomes = parseList(market.outcomes ?? []);
    const prices = parseList(market.outcomePrices ?? []);
    const probability = Number(prices[outcomes.indexOf('Yes')]);
    return probability >= 0 && probability <= 1 ? probability : null;
  } catch {
    return null;
  }
}

function parseMarket(market, event) {
  const name = market.groupItemTitle?.trim();
  if (market.closed || market.active === false || !name || PLACEHOLDER.test(name)) return null;
  const probability = yesPrice(market);
  if (probability === null) return null;
  const bid = number(market.bestBid);
  const ask = number(market.bestAsk);
  return {
    id: slug(name),
    name,
    probability: probability * 100,
    bid,
    ask,
    spread: bid !== null && ask !== null ? ask - bid : null,
    liquidity: number(market.liquidity),
    volume24h: number(market.volume24hr),
    url: `https://polymarket.com/event/${event.slug ?? ''}/${market.slug ?? ''}`,
  };
}

export function parseEvent(raw, capturedAt, title) {
  const event = Array.isArray(raw) ? raw[0] : raw;
  if (!event?.markets?.length) throw new Error('Événement Polymarket absent ou schéma modifié.');
  const markets = event.markets
    .map(market => parseMarket(market, event))
    .filter(Boolean)
    .sort((a, b) => b.probability - a.probability);
  if (!markets.length) throw new Error('Aucun prix public exploitable.');
  return {
    capturedAt,
    updatedAt: event.updatedAt,
    url: `https://polymarket.com/event/${event.slug ?? 'next-french-presidential-election'}`,
    title: title ?? event.title,
    endDate: event.endDate,
    scope: 'Victoire nationale, toutes candidatures possibles, inconditionnelle.',
    markets,
    live: true,
  };
}

async function fetchBoard(board, capturedAt, signal) {
  const response = await fetch(GAMMA_EVENTS + board.slug, { signal });
  if (!response.ok) throw new Error(`Polymarket ${response.status}`);
  return parseEvent(await response.json(), capturedAt, board.title);
}

// Tous les tableaux en parallèle ; un tableau en échec garde simplement le relevé de la nuit.
export async function fetchLiveMarkets(signal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const combined = AbortSignal.any ? AbortSignal.any([signal, timeout]) : timeout;
  const capturedAt = new Date().toISOString();
  const results = await Promise.allSettled(LIVE_BOARDS.map(board => fetchBoard(board, capturedAt, combined)));
  const boards = Object.fromEntries(LIVE_BOARDS
    .map((board, index) => [board.key, results[index].status === 'fulfilled' ? results[index].value : null])
    .filter(([, value]) => value));
  if (!Object.keys(boards).length) throw new Error('Polymarket ne répond pas.');
  return { capturedAt, boards };
}

// Données de la nuit dans lesquelles les tableaux lus en direct remplacent ceux du relevé.
export function withLiveMarkets(data, live) {
  const { president, ...events } = live.boards;
  const marketEvents = { ...(data.marketEvents ?? {}) };
  for (const [key, board] of Object.entries(events)) {
    marketEvents[key] = { ...board, status: 'live', fetchedAt: live.capturedAt };
  }
  return {
    ...data,
    market: president ?? data.market,
    marketEvents,
    liveMarket: { capturedAt: live.capturedAt, boards: Object.keys(live.boards) },
  };
}
