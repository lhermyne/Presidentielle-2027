import { useState } from 'react';
import { InfoIcon } from '@phosphor-icons/react';
import { integer, percent, shortName } from '../lib/format.js';

const METRICS = [
  { id: 'score', label: 'Premier tour', column: 'Score projeté', description: 'Projection expérimentale des suffrages exprimés. Le trait fin indique l’intervalle simulé à 90 %.' },
  { id: 'qualification', label: 'Qualification', column: 'Dans les deux premiers', description: 'Part des simulations où le candidat termine parmi les deux premiers.' },
  { id: 'runoff', label: 'Second tour', description: 'Les duels les plus probables et le score projeté de chaque finaliste, avec son intervalle simulé à 90 %.' },
];
const VISIBLE_ROWS = 8;
// En dessous de 1 % des simulations, un duel repose sur trop peu de cas pour être affiché.
const MIN_DUEL_PROBABILITY = 1;

function metricValues(row, metric) {
  if (metric === 'score') return { value: row.score, lower: row.lower, upper: row.upper };
  return { value: row.qualification, lower: row.qualification, upper: row.qualification };
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
  return (
    <div className="score-cell" role="cell">
      <strong>{percent(value)}</strong>
      {metric === 'score' && <small>{percent(lower).replace(' %', '')} à {percent(upper)}</small>}
    </div>
  );
}

function ResultBar({ metric, max, value, lower, upper, label }) {
  const position = number => `${Math.min(100, Math.max(0, number / max * 100))}%`;
  const description = metric === 'score'
    ? `${label} : ${percent(value)}, intervalle à 90 % de ${percent(lower)} à ${percent(upper)}`
    : `${label} : ${percent(value)}`;
  return (
    <div className="bar-cell" role="cell" aria-label={description}>
      <div className="bar-track">
        <span className="bar-fill" style={{ width: position(value) }} />
        {metric === 'score' && <span className="bar-interval" style={{ left: position(lower), width: `calc(${position(upper)} - ${position(lower)})` }} />}
      </div>
    </div>
  );
}

function DuelSide({ row, projection, alignEnd }) {
  return (
    <div className={`duel-side ${alignEnd ? 'is-end' : ''}`}>
      <Portrait row={row} />
      <span>
        <strong>{shortName(row.name)}</strong>
        {projection && <small>{percent(projection.lower[row.id]).replace(' %', '')} à {percent(projection.upper[row.id])}</small>}
      </span>
      {projection && <b>{percent(projection.scores[row.id])}</b>}
    </div>
  );
}

function DuelRow({ pair, rows }) {
  const finalists = rows.filter(row => pair.key.split('|').includes(row.id));
  if (finalists.length !== 2) return null;
  const [left, right] = finalists;
  const { projection } = pair;
  return (
    <div className="duel-row" role="row">
      <p className="duel-chance">{percent(pair.probability)} de chances que ce duel ait lieu</p>
      <div className="duel-sides">
        <DuelSide row={left} projection={projection} />
        <DuelSide row={right} projection={projection} alignEnd />
      </div>
      {projection
        ? (
          <div className="duel-bar" role="img" aria-label={`${left.name} ${percent(projection.scores[left.id])}, ${right.name} ${percent(projection.scores[right.id])}`}>
            <span style={{ '--candidate': left.color, flexGrow: projection.scores[left.id] }} />
            <span style={{ '--candidate': right.color, flexGrow: projection.scores[right.id] }} />
            <i aria-hidden="true" />
          </div>
        )
        : <p className="missing-duel">Duel jamais sondé : aucun score projeté.</p>}
    </div>
  );
}

function CandidateTable({ result, metric, rows, max }) {
  return (
    <div className="results-table" role="table" aria-label={`${metric.column} par candidat`}>
      <div className="result-head" role="row">
        <span role="columnheader">Candidat</span>
        <span role="columnheader" className="bar-head" aria-label={`Échelle de 0 à ${max} %`}>
          <span>0</span><span>{max / 2} %</span><span>{max} %</span>
        </span>
        <span role="columnheader">{metric.column}</span>
      </div>
      {rows.map((row, index) => {
        const values = metricValues(row, metric.id);
        return (
          <div className="result-row" key={row.id} role="row" style={{ '--candidate': row.color }}>
            <div className="candidate-cell" role="cell">
              <span className="rank">{index + 1}</span>
              <Portrait row={row} />
              <span><strong>{row.name}</strong><small>{row.party || 'Personnalité testée'}</small></span>
            </div>
            <ResultBar metric={metric.id} max={max} label={metric.column} {...values} />
            <ScoreLabel metric={metric.id} {...values} />
          </div>
        );
      })}
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
  const isDuels = metricId === 'runoff';
  const duels = result.pairs.filter(pair => pair.probability >= MIN_DUEL_PROBABILITY);
  const visible = expanded ? result.rows : result.rows.slice(0, VISIBLE_ROWS);
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

      {isDuels
        ? <div className="duel-rows" role="table" aria-label="Duels de second tour">{duels.map(pair => <DuelRow key={pair.key} pair={pair} rows={result.rows} />)}</div>
        : <CandidateTable result={result} metric={metric} rows={visible} max={max} />}

      {!isDuels && result.rows.length > VISIBLE_ROWS && (
        <button type="button" className="text-button expand-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Réduire la liste' : `Voir les ${result.rows.length} candidats`}
        </button>
      )}
      <div className="chart-note">
        <InfoIcon aria-hidden="true" size={17} />
        <p>
          {isDuels
            ? `Seuls les duels présents dans au moins ${MIN_DUEL_PROBABILITY} % des simulations apparaissent. Les scores partent des sondages du duel, puis Polymarket les corrige. Aucun report de voix n’est inventé.`
            : 'Ces résultats dépendent des candidats retenus. L’incertitude repose sur des hypothèses explicites, en cours de validation.'}
        </p>
      </div>
    </section>
  );
}
