import { useMemo, useState } from 'react';
import { pollingHistory } from '../../../model/forecast.mjs';
import { dateLabel, shortName } from '../lib/format.js';

export default function HistoryChart({ data, result }) {
  const [hidden, setHidden] = useState([]);
  const history = useMemo(() => result?.configuration ? pollingHistory(data, result.configuration.id, result.settings.halfLife) : [], [data, result?.configuration?.id, result?.settings?.halfLife]);
  const leaders = result?.rows?.slice(0, 5) ?? [];
  const width = 760, height = 230, pad = { left: 35, right: 20, top: 16, bottom: 32 };
  const first = Date.parse(history[0]?.date ?? data.asOf), last = Date.parse(history.at(-1)?.date ?? data.asOf);
  const max = Math.max(40, Math.ceil(Math.max(0, ...history.flatMap(point => leaders.map(row => point.scores[row.id] ?? 0))) / 10) * 10);
  const x = date => history.length <= 1 ? width / 2 : pad.left + (Date.parse(date) - first) / Math.max(1, last - first) * (width - pad.left - pad.right);
  const y = score => height - pad.bottom - score / max * (height - pad.top - pad.bottom);
  return <section className="panel history-panel"><div className="panel-heading"><div><span className="section-label">DANS LE TEMPS</span><h2>La tendance, avec du recul.</h2></div></div><p className="metric-description">Moyenne des sondages compatibles, recalculée aux dates de terrain. Les réglages de mémoire s’appliquent à cette courbe.</p>
    {history.length ? <><div className="history-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Évolution des moyennes de sondages du ${dateLabel(history[0].date)} au ${dateLabel(history.at(-1).date)}. Les valeurs actuelles figurent dans le tableau précédent.`}>
      {[0, max / 4, max / 2, max * 3 / 4, max].map(value => <g key={value}><line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} stroke="#e4e9e3" strokeDasharray="3 5" /><text x={pad.left - 9} y={y(value) + 4} textAnchor="end">{value}</text></g>)}
      {leaders.filter(row => !hidden.includes(row.id)).map(row => <g key={row.id}><polyline fill="none" stroke={row.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={history.map(point => `${x(point.date)},${y(point.scores[row.id])}`).join(' ')} />{history.map(point => <circle key={point.date} cx={x(point.date)} cy={y(point.scores[row.id])} r="3" fill="white" stroke={row.color} strokeWidth="2"><title>{row.name} : {point.scores[row.id].toFixed(1)} % au {dateLabel(point.date)}</title></circle>)}</g>)}
      {history.filter((_, index) => index === 0 || index === history.length - 1 || index === Math.floor(history.length / 2)).map(point => <text key={point.date} x={x(point.date)} y={height - 7} textAnchor="middle">{dateLabel(point.date, true)}</text>)}
    </svg></div><div className="chart-legend" role="group" aria-label="Afficher ou masquer une courbe">{leaders.map(row => <button key={row.id} aria-pressed={!hidden.includes(row.id)} style={{ '--candidate': row.color }} onClick={() => setHidden(previous => previous.includes(row.id) ? previous.filter(id => id !== row.id) : [...previous, row.id])}><span />{shortName(row.name)}</button>)}</div>{history.length === 1 && <p className="field-help">Une seule date disponible pour cette configuration : aucun historique de tendance n’est interpolé.</p>}</> : <p className="empty-inline">Historique insuffisant pour cette configuration.</p>}
    <p className="source-caption">Source : Sondax, d’après Wikipédia · Configurations identiques uniquement · Une courbe de sondages, sans ajout du baromètre.</p>
  </section>;
}
