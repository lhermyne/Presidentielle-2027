import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEvent, withLiveMarkets } from '../front-end/src/lib/liveMarket.js';
import { allConfigurations, forecast } from '../model/forecast.mjs';

const latest = JSON.parse(readFileSync(new URL('../data/latest.json', import.meta.url), 'utf8'));

function gammaMarket(name, price, extra = {}) {
  return {
    groupItemTitle: name,
    slug: name.toLowerCase().replaceAll(' ', '-'),
    outcomes: JSON.stringify(['Yes', 'No']),
    outcomePrices: JSON.stringify([price, 1 - price]),
    bestBid: price - 0.005,
    bestAsk: price + 0.005,
    liquidity: '1000',
    ...extra,
  };
}

test('a live Polymarket event is read like the nightly collection', () => {
  const raw = [{ slug: 'event', title: 'Event', markets: [
    gammaMarket('Jean-Luc Mélenchon', 0.12),
    gammaMarket('Candidate A', 0.5),
    gammaMarket('Marine Le Pen', 0.45),
    gammaMarket('Jordan Bardella', 0.02, { closed: true }),
  ] }];
  const board = parseEvent(raw, '2026-11-10T14:32:00Z', 'Titre');

  assert.deepEqual(board.markets.map(market => market.id), ['marine-le-pen', 'jean-luc-melenchon']);
  assert.equal(board.markets[0].probability, 45);
  assert.equal(board.title, 'Titre');
  assert.equal(board.live, true);
});

test('live boards replace the nightly ones and the model still uses them the next day', () => {
  const nextDay = new Date(Date.parse(`${latest.asOf}T12:00:00Z`) + 86400000).toISOString();
  const president = { ...latest.market, capturedAt: nextDay, live: true };
  const live = { capturedAt: nextDay, boards: { president } };
  const data = withLiveMarkets(latest, live);

  assert.equal(data.market.capturedAt, nextDay);
  assert.deepEqual(data.marketEvents, latest.marketEvents);
  assert.deepEqual(data.liveMarket.boards, ['president']);

  const id = allConfigurations(data)[0].id;
  const result = forecast(data, id, { simulations: 2000 });
  assert.ok(result.marketFusion.active, 'les prix lus le lendemain du relevé restent recevables');
});
