import { useState } from 'react';
import { InfoIcon } from '@phosphor-icons/react';
import { integer, percent } from '../lib/format.js';

const METRICS = [{ id: 'score', label: 'Premier tour' }, { id: 'qualification', label: 'Qualification' }, { id: 'victory', label: 'Victoire' }];
export default function Results({ result, pending }) {
  const [metric, setMetric] = useState('score');
  const [expanded, setExpanded] = useState(false);
  if (!result || result.error) return <section className="panel empty-state"><h2>Pas de prévision disponible</h2><p>{result?.error ?? 'Calcul des simulations en cours…'}</p></section>;
  const rows = expanded ? result.rows : result.rows.slice(0, 8);
  const max = metric === 'score' ? Math.max(40, Math.ceil(Math.max(...result.rows.map(row => row.upper)) / 10) * 10) : 100;
  const label = metric === 'score' ? 'Score projeté' : metric === 'qualification' ? 'Dans les deux premiers' : 'Probabilité de victoire';
  return <section className="panel results-panel" aria-busy={pending}>
    <div className="panel-heading"><div><span className="section-label">LE RAPPORT DE FORCE</span><h2>Les projections.</h2></div><span className={`model-label ${result.isPersonal ? 'personal' : ''}`}>{pending ? 'Calcul en cours…' : result.isPersonal ? 'Votre simulation' : 'Mélange de référence'}</span></div>
    <div className="result-toolbar"><div className="segmented" role="group" aria-label="Indicateur affiché">{METRICS.map(item => <button key={item.id} onClick={() => setMetric(item.id)} aria-pressed={metric === item.id}>{item.label}</button>)}</div><span className="simulation-count">{integer(result.settings.simulations)} simulations</span></div>
    <p className="metric-description">{metric === 'score' ? 'Projection expérimentale des suffrages exprimés ; intervalle simulé à 90 %.' : metric === 'qualification' ? 'Fréquence à laquelle chaque candidat termine parmi les deux premiers.' : 'Sondages des duels et anticipation de victoire Polymarket. Fourchette lorsque des duels manquent.'}</p>
    <div className="results-table" role="table" aria-label={`${label} par candidat`}>
      <div className="result-head" role="row"><span role="columnheader">Candidat</span><span role="columnheader">{label}</span><div className="chart-axis" role="columnheader" aria-label="Échelle en pourcentage">{[0, max / 4, max / 2, max * 3 / 4, max].map(value => <span key={value}>{value}<small> %</small></span>)}</div></div>
      {rows.map((row, index) => {
        const value = metric === 'score' ? row.score : metric === 'qualification' ? row.qualification : row.winLower;
        const lower = metric === 'score' ? row.lower : metric === 'qualification' ? row.qualification : row.winLower;
        const upper = metric === 'score' ? row.upper : metric === 'qualification' ? row.qualification : row.winUpper;
        return <div className="result-row" key={row.id} role="row">
          <div className="candidate-cell" role="cell"><span className="rank">{index + 1}</span><span className="portrait" style={{ '--candidate': row.color }}>{row.photo ? <img src={`${import.meta.env.BASE_URL}${row.photo}`} alt="" width="42" height="42" loading="lazy" /> : <span>{row.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span>}</span><span><strong>{row.name}</strong><small>{row.party || 'Personnalité testée'}</small></span></div>
          <div className="score-cell" role="cell"><strong>{metric === 'victory' && upper - lower > 0.15 ? `${percent(lower).replace(' %', '')}–${percent(upper)}` : percent(value)}</strong>{metric === 'score' && <small>{percent(lower).replace(' %', '')} à {percent(upper)}</small>}</div>
          <div className="interval-cell" role="cell"><svg viewBox="0 0 400 28" role="img" aria-label={metric === 'score' ? `Intervalle à 90 % : ${percent(lower)} à ${percent(upper)}` : `${label} : ${percent(lower)}${upper !== lower ? ` à ${percent(upper)}` : ''}`}>
            {[0, 100, 200, 300, 400].map(x => <line key={x} x1={x} x2={x} y1="0" y2="28" stroke="#e9ede8" />)}
            <line x1={lower / max * 392 + 4} x2={upper / max * 392 + 4} y1="14" y2="14" stroke={row.color} strokeWidth="8" strokeOpacity="0.3" strokeLinecap="round" />
            {metric !== 'victory' || upper - lower < 0.15 ? <circle cx={value / max * 392 + 4} cy="14" r="5" fill={row.color} /> : <><circle cx={lower / max * 392 + 4} cy="14" r="4" fill={row.color} /><circle cx={upper / max * 392 + 4} cy="14" r="4" fill="white" stroke={row.color} strokeWidth="2" /></>}
          </svg></div>
        </div>;
      })}
    </div>
    {result.rows.length > 8 && <button className="text-button expand-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Réduire la liste' : `Voir les ${result.rows.length} candidats de cette configuration`}</button>}
    <div className="chart-note"><InfoIcon aria-hidden="true" size={17} /><p>{metric === 'victory' ? `${percent(result.unresolved)} des simulations aboutissent à un duel non documenté. Les bornes encadrent cette part inconnue, sans inventer de report de voix.` : 'Ces résultats sont conditionnels aux candidatures sélectionnées. L’incertitude repose sur des hypothèses explicites, en cours de validation.'}</p></div>
  </section>;
}
