import { dateLabel, percent, shortName } from '../lib/format.js';

function DuelItem({ pair, meta, rank }) {
  const ids = pair.key.split('|').sort((a, b) => (rank[a] ?? 99) - (rank[b] ?? 99));
  const surveys = pair.estimate?.pollCount ?? 0;
  return (
    <div className="duel-item">
      <div>
        <strong>{ids.map(id => shortName(meta[id]?.name ?? id)).join(' / ')}</strong>
        <span>{percent(pair.probability)} des simulations</span>
      </div>
      {pair.estimate
        ? <>
          <div className="duel-scores">
            {ids.map(id => <span key={id}>{percent(pair.estimate.scores[id])}</span>)}
          </div>
          <small>Sondages du duel · {surveys} enquête{surveys > 1 ? 's' : ''} · {dateLabel(pair.estimate.latest, true)}</small>
        </>
        : <span className="missing-duel">Aucun sondage récent de ce duel</span>}
    </div>
  );
}

export default function DuelsPanel({ result, data }) {
  const meta = Object.fromEntries(data.candidates.map(candidate => [candidate.id, candidate]));
  const rank = Object.fromEntries((result?.rows ?? []).map((row, index) => [row.id, index]));
  return (
    <section className="panel duels-panel">
      <div className="panel-heading"><div><span className="section-label">L’ÉTAPE SUIVANTE</span><h2>Les duels possibles.</h2></div></div>
      <p className="metric-description">Les affiches suivent votre scénario du premier tour ; les scores sont les moyennes des sondages de chaque duel.</p>
      <div className="duel-list">
        {result?.pairs
          ? result.pairs.slice(0, 4).map(pair => <DuelItem key={pair.key} pair={pair} meta={meta} rank={rank} />)
          : <p>Calcul en cours…</p>}
      </div>
    </section>
  );
}
