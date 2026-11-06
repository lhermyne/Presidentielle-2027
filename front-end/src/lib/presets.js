import { DEFAULT_WEIGHTS, SOURCE_IDS } from '../../../model/forecast.mjs';

export const POLLS_ONLY = Object.freeze(
  Object.fromEntries(SOURCE_IDS.map(id => [id, id === 'polls' ? 100 : 0])),
);

export const PRESETS = Object.freeze([
  { id: 'reference', label: 'Toutes les sources', weights: DEFAULT_WEIGHTS },
  { id: 'polls', label: 'Sondages seuls', weights: POLLS_ONLY },
]);

export function activePresetId(weights) {
  const preset = PRESETS.find(item => SOURCE_IDS.every(id => item.weights[id] === weights[id]));
  return preset?.id ?? null;
}
