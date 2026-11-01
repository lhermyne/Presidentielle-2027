import { useState } from 'react';
import { InfoIcon } from '@phosphor-icons/react';
import { integer, percent } from '../lib/format.js';

const METRICS = [
  { id: 'score', label: 'Premier tour', column: 'Score projeté', description: 'Projection expérimentale des suffrages exprimés. Le trait fin indique l’intervalle simulé à 90 %.' },
  { id: 'qualification', label: 'Qualification', column: 'Dans les deux premiers', description: 'Part des simulations où le candidat termine parmi les deux premiers.' },
  { id: 'runoff', label: 'Second tour', column: 'Score au second tour', description: 'Score moyen au second tour lorsque le candidat est qualifié, d’après les sondages de duels. Le trait fin indique l’intervalle simulé à 90 %.' },
  { id: 'victory', label: 'Victoire', column: 'Probabilité de victoire', description: 'Selon les sondages de duels et l’anticipation de Polymarket. Une fourchette apparaît quand des duels manquent.' },
];
const VISIBLE_ROWS = 8;
// En dessous de 1 % de qualifications, un score de second tour repose sur trop peu de simulations.
const MIN_RUNOFF_QUALIFICATION = 1;
const WITH_INTERVAL = ['score', 'runoff'];

function metricValues(row, metric) {
  if (metric === 'score') return { value: row.score, lower: row.lower, upper: row.upper };
  if (metric === 'qualification') return { value: row.qualification, lower: row.qualification, upper: row.qualification };
  if (metric === 'runoff') return { value: row.runoff.score, lower: row.runoff.lower, upper: row.runoff.upper };
  return { value: row.winLower, lower: row.winLower, upper: row.winUpper };
}

function initials(name) {
  return name.split(' ').map(word => word[0]).slice(0, 2).join('');
}

function Portrait({ row }) {
  return (
    <span className="portrait" style={{ '--candidate': row.color }}>
      {row.photo
        ? <img src={`${import.meta.env.BASE_URL}${row.photo}`} alt="" width="42" height="42" loading="lazy" />
        : <span>{initials(row.name)}</span>}
    </span>
  );
}

function ScoreLabel({ metric, value, lower, upper }) {
  const isRange = metric === 'victory' && upper - lower > 0.15;
  return (
    <div className="score-cell" role="cell">
      <strong>{isRange ? `${percent(lower).replace(' %', '')}–${percent(upper)}` : percent(value)}</strong>
      {WITH_INTERVAL.includes(metric) && <small>{percent(lower).replace(' %', '')} à {percent(upper)}</small>}
    </div>
  );
}

function ResultBar({ metric, max, value, lower, upper, label }) {
  const position = number => `${Math.min(100, Math.max(0, number / max * 100))}%`;
  const isRange = metric === 'victory' && upper - lower > 0.15;
  const description = WITH_INTERVAL.includes(metric)
    ? `${label} : ${percent(value)}, intervalle à 90 % de ${percent(lower)} à ${percent(upper)}`
    : `${label} : ${percent(lower)}${isRange ? ` à ${percent(upper)}` : ''}`;
  return (
    <div className="bar-cell" role="cell" aria-label={description}>
      <div className="bar-track">
        {isRange && <span className="bar-range" style={{ width: position(upper) }} />}
        <span className="bar-fill" style={{ width: position(value) }} />
        {metric === 'runoff' && <span className="bar-majority" title="Majorité absolue" />}
        {WITH_INTERVAL.includes(metric) && <span className="bar-interval" style={{ left: position(lower), width: `calc(${position(upper)} - ${position(lower)})` }} />}
      </div>
    </div>
  );
}

export default function Results({ result, pending }) {
  const [metricId, setMetricId] = useState('score');
  const [expanded, setExpanded] = useState(false);

  if (!result) {
    return (
      <section className="panel empty-state results-loading" aria-busy="true">
        <span className="loading-ring" aria-hidden="true" />
        <p>Calcul des simulations en cours…</p>
      </section>
    );
  }
  if (result.error) {
    return <section className="panel empty-state"><h2>Pas de prévision disponible</h2><p>{result.error}</p></section>;
  }

  const metric = METRICS.find(item => item.id === metricId);
  const eligible = metricId === 'runoff'
    ? result.rows.filter(row => row.runoff && row.qualification >= MIN_RUNOFF_QUALIFICATION)
    : result.rows;
  const rows = expanded ? eligible : eligible.slice(0, VISIBLE_ROWS);
  const max = metricId === 'score' ? Math.max(40, Math.ceil(Math.max(...result.rows.map(row => row.upper)) / 10) * 10) : 100;
  const modelLabel = pending ? 'Calcul en cours…' : result.isPersonal ? 'Votre simulation' : 'Réglages de référence';

  return (
    <section className="panel results-panel" aria-busy={pending}>
      <div className="panel-heading">
        <div><span className="section-label">LE RAPPORT DE FORCE</span><h2>Les projections.</h2></div>
        <span className={`model-label ${result.isPersonal ? 'personal' : ''}`}>{modelLabel}</span>
      </div>

      <div className="result-toolbar">
        <div className="segmented" role="group" aria-label="Indicateur affiché">
          {METRICS.map(item => (
            <button type="button" key={item.id} onClick={() => setMetricId(item.id)} aria-pressed={metricId === item.id}>{item.label}</button>
          ))}
        </div>
        <span className="simulation-count">{integer(result.settings.simulations)} simulations</span>
      </div>
      <p className="metric-description">{metric.description}</p>

      <div className="results-table" role="table" aria-label={`${metric.column} par candidat`}>
        <div className="result-head" role="row">
          <span role="columnheader">Candidat</span>
          <span role="columnheader" className="bar-head" aria-label={`Échelle de 0 à ${max} %`}>
            <span>0</span><span>{max / 2} %</span><span>{max} %</span>
          </span>
          <span role="columnheader">{metric.column}</span>
        </div>
        {rows.map((row, index) => {
          const values = metricValues(row, metricId);
          return (
            <div className="result-row" key={row.id} role="row" style={{ '--candidate': row.color }}>
              <div className="candidate-cell" role="cell">
                <span className="rank">{index + 1}</span>
                <Portrait row={row} />
                <span><strong>{row.name}</strong><small>{row.party || 'Personnalité testée'}</small></span>
              </div>
              <ResultBar metric={metricId} max={max} label={metric.column} {...values} />
              <ScoreLabel metric={metricId} {...values} />
            </div>
          );
        })}
      </div>

      {eligible.length > VISIBLE_ROWS && (
        <button type="button" className="text-button expand-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Réduire la liste' : `Voir les ${eligible.length} candidats`}
        </button>
      )}
      <div className="chart-note">
        <InfoIcon aria-hidden="true" size={17} />
        <p>
          {metricId === 'runoff'
            ? `Seuls les candidats qualifiés dans au moins ${MIN_RUNOFF_QUALIFICATION} % des simulations, avec un duel sondé, apparaissent. Aucun report de voix n’est inventé.`
            : metricId === 'victory'
            ? `${percent(result.unresolved)} des simulations aboutissent à un duel non documenté. Les bornes encadrent cette part inconnue, sans inventer de report de voix.`
            : 'Ces résultats dépendent de la liste de candidats choisie. L’incertitude repose sur des hypothèses explicites, en cours de validation.'}
        </p>
      </div>
    </section>
  );
}
