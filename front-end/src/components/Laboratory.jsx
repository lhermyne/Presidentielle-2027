import { ArrowCounterClockwiseIcon, SlidersHorizontalIcon, ArrowUpRightIcon } from '@phosphor-icons/react';
import { Link } from 'react-router';
import { DEFAULT_SETTINGS, DEFAULT_WEIGHTS, SOURCE_IDS, SOURCE_LABELS, redistributeWeights, sourceComponents } from '../../../model/forecast.mjs';
import { dateLabel, shortName } from '../lib/format.js';

export default function Laboratory({ configurations, configurationId, setConfigurationId, settings, setSettings, data }) {
  const names = Object.fromEntries(data.candidates.map(candidate => [candidate.id, candidate.name]));
  const configuration = configurations.find(item => item.id === configurationId);
  const components = sourceComponents(data, configuration?.candidateIds ?? [], settings.halfLife);
  const availableWeight = SOURCE_IDS.reduce((total, id) => total + (components[id].available ? settings.weights[id] : 0), 0);
  const unavailable = SOURCE_IDS.filter(id => settings.weights[id] > 0 && !components[id].available);
  const set = (key, value) => setSettings(previous => ({ ...previous, [key]: Number(value) }));
  const preset = source => setSettings(previous => ({ ...previous, weights: source ? Object.fromEntries(SOURCE_IDS.map(id => [id, id === source ? 100 : 0])) : { ...DEFAULT_WEIGHTS } }));
  return <aside id="laboratoire" className="laboratory panel" aria-label="Personnaliser les hypothèses">
    <div className="lab-title"><span className="lab-icon"><SlidersHorizontalIcon aria-hidden="true" size={20} /></span><div><h2>Le laboratoire</h2><p>Réglez l’influence des sources.</p></div></div>
    <div className="lab-body">
      <label className="field-label" htmlFor="configuration">Configuration des candidatures</label>
      <select id="configuration" name="configuration" value={configurationId} onChange={event => setConfigurationId(event.target.value)}>{configurations.map((item, index) => {
        const leaders = Object.entries(item.example.scores).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => shortName(names[id] ?? id)).join(' / ');
        return <option key={item.id} value={item.id}>{index === 0 ? 'La plus récente · ' : ''}{leaders} · {item.candidateIds.length} candidats · {item.pollCount} enquête{item.pollCount > 1 ? 's' : ''} · {dateLabel(item.latest, true)}</option>;
      })}</select>
      <p className="field-help">{configuration?.candidateIds.length} personnalités testées ensemble.</p>
      <fieldset className="source-weights"><legend>Influence des sources <span>100 %</span></legend><p className="weight-explainer">Sondages, Polymarket et Google Trends se partagent 100 %. Augmenter une source réduit les deux autres au prorata. Le baromètre se règle séparément ci-dessous.</p>
        <div className="weight-presets"><button className="button" onClick={() => preset(null)}>Répartition de base</button><button className="button" onClick={() => preset('polls')}>100 % sondages</button></div>
        {SOURCE_IDS.map(id => {
          const effective = availableWeight && components[id].available ? settings.weights[id] * 100 / availableWeight : 0;
          const role = { polls: 'Socle des scores du premier tour', polymarket: 'Anticipations de victoire finale', trends: 'Correction d’attention, pas d’adhésion' }[id];
          return <div className="slider-field source-slider" key={id}><div><label htmlFor={`weight-${id}`}>{SOURCE_LABELS[id]}</label><output htmlFor={`weight-${id}`}>{settings.weights[id]} %</output></div><input id={`weight-${id}`} name={`weight-${id}`} type="range" min="0" max="100" step="1" value={settings.weights[id]} onChange={event => setSettings(previous => ({ ...previous, weights: redistributeWeights(previous.weights, id, event.target.value) }))} aria-describedby={`weight-note-${id}`} /><p id={`weight-note-${id}`} className={!components[id].available ? 'signal-unavailable' : ''}>{components[id].available ? `${role} · ${effective.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % utilisés.` : components[id].reason}</p></div>;
        })}
        {unavailable.length > 0 && <p className="weight-warning" role="status">{unavailable.map(id => SOURCE_LABELS[id]).join(', ')} : aucun signal exploitable. {availableWeight ? 'Poids répartis au prorata des sources disponibles ; les poids utilisés sont affichés ci-dessus.' : 'Aucune source exploitable dans cette répartition.'}</p>}
        {settings.weights.polls === 0 && <p className="weight-warning" role="status">Sans socle de sondages, les signaux restent consultables, mais aucun score électoral n’est fabriqué.</p>}
      </fieldset>
      <div className="slider-field boost-field"><span className="section-label">INDÉPENDANT DES 100 %</span><div><label htmlFor="barometer-multiplier">Boost du baromètre</label><output htmlFor="barometer-multiplier">×{settings.barometerMultiplier.toLocaleString('fr-FR')}</output></div><input name="barometer-multiplier" id="barometer-multiplier" type="range" min="0" max="5" step="0.25" value={settings.barometerMultiplier} onChange={event => set('barometerMultiplier', event.target.value)} aria-describedby="barometer-boost-help" /><div className="range-labels"><span>×0 · aucun boost</span><span>×5</span></div><p id="barometer-boost-help">60 ‰ ×{settings.barometerMultiplier.toLocaleString('fr-FR')} donnent +{(6 * settings.barometerMultiplier).toLocaleString('fr-FR')} % relatif : 10 % → {(10 * (1 + .06 * settings.barometerMultiplier)).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % avant renormalisation. Ce curseur ne modifie aucun poids de source. Pour les sondages sans boost, choisissez ×0.</p><p className={!components.barometer.available ? 'signal-unavailable' : ''}>{components.barometer.available ? `Dynamique depuis la fin du terrain du ${dateLabel(components.barometer.anchor)} ; la date de publication n’est pas renseignée.` : components.barometer.reason}</p></div>
      <details className="advanced-settings"><summary>Mémoire et incertitude</summary>
        <div className="slider-field"><div><label htmlFor="half-life">Mémoire des sondages</label><output htmlFor="half-life">{settings.halfLife} jours</output></div><input name="half-life" id="half-life" type="range" min="7" max="90" step="1" value={settings.halfLife} onChange={event => set('halfLife', event.target.value)} /><p>Le poids d’une enquête est divisé par deux après cette durée.</p></div>
        <div className="slider-field"><div><label htmlFor="uncertainty">Incertitude de campagne</label><output htmlFor="uncertainty">{settings.uncertainty.toLocaleString('fr-FR')} points</output></div><input name="uncertainty" id="uncertainty" type="range" min="2" max="8" step="0.5" value={settings.uncertainty} onChange={event => set('uncertainty', event.target.value)} /><p>Échelle hypothétique, à calibrer sur les élections précédentes.</p></div>
      </details>
      <button className="button reset-button" onClick={() => setSettings({ ...DEFAULT_SETTINGS, weights: { ...DEFAULT_WEIGHTS } })}><ArrowCounterClockwiseIcon aria-hidden="true" size={17} />Rétablir la référence</button>
    </div>
    <div className="lab-footer"><strong>Un boost indépendant.</strong><p>La répartition des sources et le multiplicateur du baromètre se règlent séparément. Ces paramètres restent exploratoires.</p><Link to="/methode#signaux">Comprendre les sources <ArrowUpRightIcon aria-hidden="true" size={15} /></Link></div>
  </aside>;
}
