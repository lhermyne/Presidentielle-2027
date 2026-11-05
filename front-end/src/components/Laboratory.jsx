import { ArrowCounterClockwiseIcon, SlidersHorizontalIcon, ArrowUpRightIcon, LockSimpleIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';
import {
  MULTIPLIER_IDS,
  WEIGHT_PER_MULTIPLIER,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  MIN_POLL_WEIGHT,
  SOURCE_IDS,
  SOURCE_LABELS,
  sourceComponents,
  sourceShares,
} from '../../../model/forecast.mjs';
import { dateLabel, shortName } from '../lib/format.js';

const SOURCE_ROLES = {
  polls: 'Socle obligatoire des scores',
  barometer: 'Dynamique des abonnés : bonus ou malus relatif',
  polymarket: 'Anticipations de victoire finale',
  wikipedia: 'Dynamique des consultations : bonus ou malus relatif',
  trends: 'Recherches en forte hausse : bonus ou malus relatif',
};
const POLLS_ONLY = Object.fromEntries(SOURCE_IDS.map(id => [id, id === 'polls' ? 100 : 0]));

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function shareLabel(share) {
  return `${share.toLocaleString('fr-FR', { maximumFractionDigits: share < 10 ? 1 : 0 })} %`;
}

function configurationLabel(item, index, names) {
  if (item.isField) return `Tous les candidats retenus · ${item.candidateIds.length} candidats · ${item.pollCount} enquêtes`;
  const leaders = Object.entries(item.example.scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => shortName(names[id] ?? id))
    .join(' / ');
  const surveys = `${item.pollCount} enquête${item.pollCount > 1 ? 's' : ''}`;
  const prefix = index <= 1 ? 'La plus récente · ' : '';
  return `${prefix}${leaders} · ${item.candidateIds.length} candidats · ${surveys} · ${dateLabel(item.latest, true)}`;
}

function InfluenceBar({ shares }) {
  const visible = SOURCE_IDS.filter(id => shares[id] > 0);
  return (
    <div className="influence">
      <div className="weight-bar" aria-hidden="true">
        {visible.map(id => <span key={id} className={`weight-segment source-${id}`} style={{ flexGrow: shares[id] }} />)}
      </div>
      <ul className="influence-legend" aria-label="Part de chaque source dans l’influence totale">
        {visible.map(id => (
          <li key={id} className={`source-${id}`}>
            <span className="source-dot" aria-hidden="true" />{SOURCE_LABELS[id]} <strong>{shareLabel(shares[id])}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function multiplierLabel(value) {
  return `×${(value / WEIGHT_PER_MULTIPLIER).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`;
}

function sourceNote(id, share, component) {
  if (id !== 'polls' && !component.available) return `Verrouillé à 0 : ${lowerFirst(component.reason)}`;
  if (share > 0 && id !== 'polls') return `${SOURCE_ROLES[id]} · ${shareLabel(share)} de l’influence`;
  return SOURCE_ROLES[id];
}

function SourceSlider({ id, value, share, component, onChange }) {
  const locked = id !== 'polls' && !component.available;
  const isMultiplier = MULTIPLIER_IDS.includes(id);
  const shown = locked ? 0 : value;
  return (
    <div className={`slider-field source-slider source-${id} ${locked ? 'is-locked' : ''}`}>
      <div>
        <label htmlFor={`weight-${id}`}>
          <span className="source-dot" aria-hidden="true" />
          {SOURCE_LABELS[id]}
          {locked && <LockSimpleIcon aria-hidden="true" size={13} weight="bold" />}
        </label>
        <output htmlFor={`weight-${id}`}>{isMultiplier ? multiplierLabel(shown) : shown}</output>
      </div>
      <input
        id={`weight-${id}`}
        name={`weight-${id}`}
        type="range"
        min={id === 'polls' ? MIN_POLL_WEIGHT : 0}
        max="100"
        step={isMultiplier ? WEIGHT_PER_MULTIPLIER / 4 : 1}
        value={shown}
        disabled={locked}
        onChange={event => onChange(id, event.target.value)}
        aria-describedby={`weight-note-${id}`}
      />
      <p id={`weight-note-${id}`} className={locked ? 'signal-unavailable' : ''}>{sourceNote(id, share, component)}</p>
    </div>
  );
}

export default function Laboratory({ configurations, configurationId, setConfigurationId, settings, setSettings, data }) {
  const names = Object.fromEntries(data.candidates.map(candidate => [candidate.id, candidate.name]));
  const configuration = configurations.find(item => item.id === configurationId);
  const components = sourceComponents(data, configuration?.candidateIds ?? []);
  const available = SOURCE_IDS.filter(id => components[id].available);
  const shares = sourceShares(settings.weights, available);

  const setNumber = (key, value) => setSettings(previous => ({ ...previous, [key]: Number(value) }));
  const changeWeight = (id, value) => setSettings(previous => ({
    ...previous,
    weights: { ...previous.weights, [id]: Number(value) },
  }));
  const applyWeights = weights => setSettings(previous => ({ ...previous, weights: { ...weights } }));
  const reset = () => setSettings({ ...DEFAULT_SETTINGS, weights: { ...DEFAULT_WEIGHTS } });

  return (
    <aside id="laboratoire" className="laboratory panel" aria-label="Personnaliser les hypothèses">
      <div className="lab-title">
        <span className="lab-icon"><SlidersHorizontalIcon aria-hidden="true" size={20} /></span>
        <div>
          <h2>Le laboratoire</h2>
          <p>Testez vos propres hypothèses.</p>
        </div>
      </div>

      <div className="lab-body">
        <label className="field-label" htmlFor="configuration">Candidats</label>
        <select id="configuration" name="configuration" value={configurationId} onChange={event => setConfigurationId(event.target.value)}>
          {configurations.map((item, index) => (
            <option key={item.id} value={item.id}>{configurationLabel(item, index, names)}</option>
          ))}
        </select>
        <p className="field-help">{configuration?.isField
          ? 'Tous les sondages sont réunis ; les voix des absents se reportent au prorata.'
          : `Liste testée par les instituts, ${configuration?.candidateIds.length} personnalités.`}</p>

        <fieldset className="source-weights">
          <legend>Influence des sources</legend>
          <InfluenceBar shares={shares} />
          <p className="weight-explainer">
            Chaque curseur est indépendant : seule leur proportion compte. Baromètre et Wikipédia vont
            de ×0 à ×5 (×5 pèse autant que 100). Les sondages restent le socle (minimum 1). Une source sans signal est verrouillée.
          </p>
          <div className="weight-presets">
            <button type="button" className="button" onClick={() => applyWeights(DEFAULT_WEIGHTS)}>Référence</button>
            <button type="button" className="button" onClick={() => applyWeights(POLLS_ONLY)}>Sondages seuls</button>
          </div>
          {SOURCE_IDS.map(id => (
            <SourceSlider key={id} id={id} value={settings.weights[id]} share={shares[id]} component={components[id]} onChange={changeWeight} />
          ))}
        </fieldset>

        <details className="advanced-settings">
          <summary>Mémoire et incertitude</summary>
          <div className="slider-field">
            <div>
              <label htmlFor="half-life">Mémoire des sondages</label>
              <output htmlFor="half-life">{settings.halfLife} jours</output>
            </div>
            <input name="half-life" id="half-life" type="range" min="7" max="90" step="1" value={settings.halfLife} onChange={event => setNumber('halfLife', event.target.value)} />
            <p>Un sondage compte deux fois moins après cette durée.</p>
          </div>
          <div className="slider-field">
            <div>
              <label htmlFor="uncertainty">Incertitude de campagne</label>
              <output htmlFor="uncertainty">{settings.uncertainty.toLocaleString('fr-FR')} points</output>
            </div>
            <input name="uncertainty" id="uncertainty" type="range" min="2" max="8" step="0.5" value={settings.uncertainty} onChange={event => setNumber('uncertainty', event.target.value)} />
            <p>Écart-type pour un candidat à 25 %, plus faible pour les petits scores. Hypothèse à calibrer.</p>
          </div>
        </details>

        <button type="button" className="button reset-button" onClick={reset}>
          <ArrowCounterClockwiseIcon aria-hidden="true" size={17} />Rétablir la référence
        </button>
      </div>

      <div className="lab-footer">
        <strong>Des réglages exploratoires.</strong>
        <p>Rien n’est encore calibré sur les élections passées.</p>
        <Link to="/methode#signaux">Comprendre les sources <ArrowUpRightIcon aria-hidden="true" size={15} /></Link>
      </div>
    </aside>
  );
}
