import { ArrowCounterClockwiseIcon, SlidersHorizontalIcon, ArrowUpRightIcon, LockSimpleIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';
import {
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHTS,
  SOURCE_IDS,
  SOURCE_LABELS,
  availableWeights,
  redistributeWeights,
  sourceComponents,
} from '../../../model/forecast.mjs';
import { dateLabel, shortName } from '../lib/format.js';

const SOURCE_ROLES = {
  polls: 'Socle des scores du premier tour',
  polymarket: 'Anticipations de victoire finale',
  wikipedia: 'Évolution de l’attention, pas de l’adhésion',
  trends: 'Recherches en forte hausse, pas de l’adhésion',
};

function lowerFirst(text) {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function configurationLabel(item, index, names) {
  const leaders = Object.entries(item.example.scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id]) => shortName(names[id] ?? id))
    .join(' / ');
  const surveys = `${item.pollCount} enquête${item.pollCount > 1 ? 's' : ''}`;
  const prefix = index === 0 ? 'La plus récente · ' : '';
  return `${prefix}${leaders} · ${item.candidateIds.length} candidats · ${surveys} · ${dateLabel(item.latest, true)}`;
}

function WeightBar({ weights }) {
  return (
    <div className="weight-bar" aria-hidden="true">
      {SOURCE_IDS.filter(id => weights[id] > 0).map(id => (
        <span key={id} className={`weight-segment source-${id}`} style={{ flexGrow: weights[id] }} />
      ))}
    </div>
  );
}

function SourceSlider({ id, value, component, onChange }) {
  const locked = !component.available;
  return (
    <div className={`slider-field source-slider source-${id} ${locked ? 'is-locked' : ''}`}>
      <div>
        <label htmlFor={`weight-${id}`}>
          <span className={`source-dot source-${id}`} aria-hidden="true" />
          {SOURCE_LABELS[id]}
          {locked && <LockSimpleIcon aria-hidden="true" size={13} weight="bold" />}
        </label>
        <output htmlFor={`weight-${id}`}>{value} %</output>
      </div>
      <input
        id={`weight-${id}`}
        name={`weight-${id}`}
        type="range"
        min="0"
        max="100"
        step="1"
        value={value}
        disabled={locked}
        onChange={event => onChange(id, event.target.value)}
        aria-describedby={`weight-note-${id}`}
      />
      <p id={`weight-note-${id}`} className={locked ? 'signal-unavailable' : ''}>
        {locked ? `Verrouillé à 0 % : ${lowerFirst(component.reason)}` : SOURCE_ROLES[id]}
      </p>
    </div>
  );
}

export default function Laboratory({ configurations, configurationId, setConfigurationId, settings, setSettings, data }) {
  const names = Object.fromEntries(data.candidates.map(candidate => [candidate.id, candidate.name]));
  const configuration = configurations.find(item => item.id === configurationId);
  const components = sourceComponents(data, configuration?.candidateIds ?? [], settings.halfLife);
  const locked = SOURCE_IDS.filter(id => !components[id].available);
  const shownWeights = availableWeights(settings.weights, locked);

  const setNumber = (key, value) => setSettings(previous => ({ ...previous, [key]: Number(value) }));
  const changeWeight = (id, value) => setSettings(previous => ({
    ...previous,
    weights: redistributeWeights(previous.weights, id, value, locked),
  }));
  const applyPreset = source => setSettings(previous => ({
    ...previous,
    weights: source ? Object.fromEntries(SOURCE_IDS.map(id => [id, id === source ? 100 : 0])) : { ...DEFAULT_WEIGHTS },
  }));
  const reset = () => setSettings({ ...DEFAULT_SETTINGS, weights: { ...DEFAULT_WEIGHTS } });
  const multiplier = settings.barometerMultiplier.toLocaleString('fr-FR');
  const boostedExample = (10 * (1 + 0.06 * settings.barometerMultiplier)).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

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
        <label className="field-label" htmlFor="configuration">Liste de candidats testée</label>
        <select id="configuration" name="configuration" value={configurationId} onChange={event => setConfigurationId(event.target.value)}>
          {configurations.map((item, index) => (
            <option key={item.id} value={item.id}>{configurationLabel(item, index, names)}</option>
          ))}
        </select>
        <p className="field-help">{configuration?.candidateIds.length} personnalités testées ensemble par les instituts.</p>

        <fieldset className="source-weights">
          <legend>Influence des sources <span>100 %</span></legend>
          <WeightBar weights={shownWeights} />
          <p className="weight-explainer">
            Les sources se partagent 100 %. Monter un curseur baisse les autres au prorata.
            Une source sans signal exploitable est verrouillée à 0 %.
          </p>
          <div className="weight-presets">
            <button type="button" className="button" onClick={() => applyPreset(null)}>Répartition de base</button>
            <button type="button" className="button" onClick={() => applyPreset('polls')}>100 % sondages</button>
          </div>
          {SOURCE_IDS.map(id => (
            <SourceSlider key={id} id={id} value={shownWeights[id]} component={components[id]} onChange={changeWeight} />
          ))}
          {shownWeights.polls === 0 && (
            <p className="weight-warning" role="status">Sans socle de sondages, les signaux restent consultables, mais aucun score électoral n’est fabriqué.</p>
          )}
        </fieldset>

        <div className="slider-field boost-field">
          <span className="section-label">INDÉPENDANT DES 100 %</span>
          <div>
            <label htmlFor="barometer-multiplier">Boost du baromètre</label>
            <output htmlFor="barometer-multiplier">×{multiplier}</output>
          </div>
          <input
            name="barometer-multiplier"
            id="barometer-multiplier"
            type="range"
            min="0"
            max="5"
            step="0.25"
            value={settings.barometerMultiplier}
            onChange={event => setNumber('barometerMultiplier', event.target.value)}
            aria-describedby="barometer-boost-help"
          />
          <div className="range-labels"><span>×0 · aucun boost</span><span>×5</span></div>
          <p id="barometer-boost-help">
            Exemple : une dynamique de 60 ‰ donne +{(6 * settings.barometerMultiplier).toLocaleString('fr-FR')} % relatif,
            soit 10 % → {boostedExample} % avant renormalisation.
          </p>
          <p className={!components.barometer.available ? 'signal-unavailable' : ''}>
            {components.barometer.available
              ? `Dynamique mesurée depuis la fin du terrain du ${dateLabel(components.barometer.anchor)}.`
              : components.barometer.reason}
          </p>
        </div>

        <details className="advanced-settings">
          <summary>Mémoire et incertitude</summary>
          <div className="slider-field">
            <div>
              <label htmlFor="half-life">Mémoire des sondages</label>
              <output htmlFor="half-life">{settings.halfLife} jours</output>
            </div>
            <input name="half-life" id="half-life" type="range" min="7" max="90" step="1" value={settings.halfLife} onChange={event => setNumber('halfLife', event.target.value)} />
            <p>Le poids d’une enquête est divisé par deux après cette durée.</p>
          </div>
          <div className="slider-field">
            <div>
              <label htmlFor="uncertainty">Incertitude de campagne</label>
              <output htmlFor="uncertainty">{settings.uncertainty.toLocaleString('fr-FR')} points</output>
            </div>
            <input name="uncertainty" id="uncertainty" type="range" min="2" max="8" step="0.5" value={settings.uncertainty} onChange={event => setNumber('uncertainty', event.target.value)} />
            <p>Échelle hypothétique, à calibrer sur les élections précédentes.</p>
          </div>
        </details>

        <button type="button" className="button reset-button" onClick={reset}>
          <ArrowCounterClockwiseIcon aria-hidden="true" size={17} />Rétablir la référence
        </button>
      </div>

      <div className="lab-footer">
        <strong>Des réglages exploratoires.</strong>
        <p>La répartition des sources et le boost du baromètre se règlent séparément. Rien n’est calibré historiquement.</p>
        <Link to="/methode#signaux">Comprendre les sources <ArrowUpRightIcon aria-hidden="true" size={15} /></Link>
      </div>
    </aside>
  );
}
