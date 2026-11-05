import { SOURCE_IDS, SOURCE_LABELS } from '../../../model/forecast.mjs';
import { percent, dateLabel } from '../lib/format.js';

const signed = (value, digits = 2) => `${value > 0 ? '+' : ''}${value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
const relative = (correction, base) => `${signed(base > 0 ? correction / base * 100 : 0, 1)} %`;

function CorrectionCell({ correction, base, missing }) {
  return <td>{signed(correction)}{missing ? ' *' : ''}<small className="cell-detail">{relative(correction, base)}</small></td>;
}

function UncertaintyTable({ rows }) {
  const number = value => value.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (
    <>
      <h2 className="signal-heading">Incertitude mesurée</h2>
      <p className="metric-description">
        Écart-type en points : précision de la moyenne des sondages, puis bruit de chaque source sur la mémoire des sondages. Rien n’est fixé à la main.
        Cette marge décrit la photo d’aujourd’hui, pas ce que la campagne peut encore changer d’ici au scrutin.
      </p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Incertitude mesurée par candidat">
        <table>
          <thead><tr><th scope="col">Candidat</th><th scope="col">Sondages</th><th scope="col">Polymarket</th><th scope="col">Baromètre</th><th scope="col">Wikipédia</th><th scope="col">Total</th><th scope="col">Largeur à 90 %</th></tr></thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id}>
                <th scope="row">{row.name}</th>
                <td>{number(row.uncertainty.polls)}</td><td>{number(row.uncertainty.polymarket)}</td>
                <td>{number(row.uncertainty.barometer)}</td><td>{number(row.uncertainty.wikipedia)}</td>
                <td><strong>{number(row.uncertainty.base)}</strong></td>
                <td>{number(row.upper - row.lower)} pts</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ForecastEffects({ result, names }) {
  const mix = result.sourceMix;
  const limits = result.adjustmentLimits;
  return (
    <>
      <p className="metric-description">
        Socle issu de tous les sondages, puis bonus ou malus relatifs (Polymarket, baromètre, Wikipédia, Google Trends). Une dynamique proche de zéro
        n’a pas d’effet et les très fortes variations sont comprimées en douceur. Les scores sont ensuite ramenés à 100 %. Polymarket
        corrige aussi les qualifications et les victoires après les simulations.
      </p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Effets des sources par candidat">
        <table>
          <thead>
            <tr>
              <th scope="col">Candidat</th><th scope="col">Socle sondages</th><th scope="col">Polymarket</th><th scope="col">Baromètre</th>
              <th scope="col">Wikipédia</th><th scope="col">Google Trends</th><th scope="col">Renormalisation</th>
              <th scope="col">Centre ajusté</th><th scope="col">Projection simulée</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map(row => (
              <tr key={row.id}>
                <th scope="row">{row.name}</th>
                <td>{percent(row.pollScore)}</td>
                <CorrectionCell correction={row.corrections.polymarket} base={row.pollScore} />
                <CorrectionCell correction={row.corrections.barometer} base={row.pollScore} missing={mix.barometer.missing?.includes(row.id)} />
                <CorrectionCell correction={row.corrections.wikipedia} base={row.pollScore} missing={mix.wikipedia.missing?.includes(row.id)} />
                <CorrectionCell correction={row.corrections.trends} base={row.pollScore} missing={mix.trends.missing?.includes(row.id)} />
                <td>{signed(row.renormalization)}</td>
                <td>{percent(row.center)}</td>
                <td><strong>{percent(row.score)}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="source-caption">
        Corrections en points, et en % du score sondé dessous. * Signal manquant : aucune correction, la dynamique n’est pas comptée comme nulle.
        Baromètre réglé à ×{limits.barometerScale.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} et Wikipédia à ×{limits.wikipediaScale.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}, mesurés depuis le dernier sondage de chaque candidat.
        Chaque actualisation repart du socle sondé.
      </p>
      <p className="metric-description">
        <strong>Polymarket : {result.marketFusion.active ? 'effet actif' : 'sans effet sur ce scénario'}.</strong> {result.marketFusion.reason}
        {result.marketFusion.active && ` Candidats comparés : ${result.marketFusion.compared.map(id => names[id] ?? id).join(', ')}.`}
      </p>
      <div className="component-methods">
        {SOURCE_IDS.map(id => <p key={id}><strong>{SOURCE_LABELS[id]} · {percent(mix[id].effective)}.</strong> {mix[id].reason}</p>)}
      </div>
    </>
  );
}

function WikipediaDynamics({ result, names }) {
  const periods = result?.sourceMix?.wikipedia?.periods ?? {};
  const rows = Object.entries(periods).sort((a, b) => b[1].dynamic - a[1].dynamic);
  if (!rows.length) return null;
  const daily = value => Math.round(value).toLocaleString('fr-FR');
  return (
    <>
      <h2 className="signal-heading">Dynamique Wikipédia</h2>
      <p className="metric-description">
        Consultations quotidiennes depuis le dernier sondage de chaque candidat, comparées aux 28 jours précédents.
        Les médianes neutralisent les pics d’un seul jour. C’est cette évolution qui donne le bonus ou malus.
      </p>
      <div className="table-scroll" tabIndex={0} role="region" aria-label="Dynamique des consultations Wikipédia">
        <table>
          <thead><tr><th scope="col">Personnalité</th><th scope="col">Avant le terrain</th><th scope="col">Depuis le terrain</th><th scope="col">Évolution</th></tr></thead>
          <tbody>
            {rows.map(([id, signal]) => (
              <tr key={id}>
                <th scope="row">{names[id] ?? id}</th>
                <td>{daily(signal.referenceDaily)} / jour</td>
                <td>{signal.days ? `${daily(signal.currentDaily)} / jour` : 'Pas encore de recul'}</td>
                <td>{signed(signal.change, 0)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function SourceBreakdown({ result, data }) {
  const names = Object.fromEntries(data.candidates.map(candidate => [candidate.id, candidate.name]));
  const dynamics = Object.entries(data.social.signals ?? {})
    .filter(([id, value]) => names[id] && Number.isFinite(value.barometerScore))
    .sort((a, b) => b[1].barometerScore - a[1].barometerScore);
  return (
    <section className="panel source-breakdown">
      <details key={result?.error ? 'signals' : 'forecast'} open={Boolean(result?.error)}>
        <summary>Vérifier l’effet de chaque source et consulter les dynamiques</summary>
        {result?.rows?.length > 0 && <><ForecastEffects result={result} names={names} /><UncertaintyTable rows={result.rows} /></>}
        <h2 className="signal-heading">Dynamique du baromètre</h2>
        <p className="metric-description">Repère hebdomadaire en ‰ sur 7 relevés. Être premier de ce classement ne signifie pas être favori à l’élection.</p>
        <div className="table-scroll" tabIndex={0} role="region" aria-label="Dynamique brute du baromètre">
          <table>
            <thead><tr><th scope="col">Personnalité</th><th scope="col">Dynamique pondérée</th><th scope="col">Plateformes</th></tr></thead>
            <tbody>
              {dynamics.map(([id, signal]) => (
                <tr key={id}><th scope="row">{names[id] ?? id}</th><td>{signed(signal.barometerScore)} ‰</td><td>{signal.barometerCoverage}/4</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {!dynamics.length && <p>Aucune dynamique récente exploitable.</p>}
        <WikipediaDynamics result={result} names={names} />
      </details>
    </section>
  );
}
