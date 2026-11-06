import { ArrowDownIcon, FlaskIcon } from '@phosphor-icons/react';
import { AnimatedNumber } from './Motion.jsx';
import DuelBar from './DuelBar.jsx';
import Portrait from './Portrait.jsx';
import { dateLabel, percent } from '../lib/format.js';

function pairRows(pair, rows) {
  const ids = pair?.key.split('|') ?? [];
  return rows.filter(row => ids.includes(row.id));
}

function Finalist({ row, score, side }) {
  return (
    <div className={`hero-finalist is-${side}`}>
      <Portrait row={row} size={132} className="hero-portrait" />
      <div>
        {Number.isFinite(score) && (
          <span className="hero-score"><AnimatedNumber value={score} duration={1500} /><em>%</em></span>
        )}
        <strong>{row.name}</strong>
        <small>{row.party || 'Personnalité testée'}</small>
      </div>
    </div>
  );
}

function HeroDuel({ pair, finalists }) {
  const [left, right] = finalists;
  const { projection } = pair;

  return (
    <>
      <div className="hero-duel">
        <Finalist row={left} score={projection?.scores[left.id]} side="left" />
        <Finalist row={right} score={projection?.scores[right.id]} side="right" />
      </div>
      {projection
        ? <DuelBar left={left} right={right} score={projection.scores[left.id]} lower={projection.lower[left.id]} upper={projection.upper[left.id]} />
        : <p className="hero-missing">Ce duel n’a pas été sondé récemment : aucun score n’est projeté.</p>}
      <p className="hero-chance">Ce duel ressort dans {percent(pair.probability)} des simulations.</p>
    </>
  );
}

function jumpTo(event, id) {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView();
}

export default function DuelHero({ result, data, isPersonal }) {
  const pair = result?.pairs?.[0];
  const finalists = result?.rows ? pairRows(pair, result.rows) : [];
  const hasDuel = finalists.length === 2;
  const haloStyle = hasDuel
    ? { '--halo-left': finalists[0].color, '--halo-right': finalists[1].color }
    : undefined;

  return (
    <section className="hero" style={haloStyle} aria-busy={!result}>
      <div className="hero-glow" aria-hidden="true"><span /><span /></div>
      <div className="hero-inner">
        <p className="hero-eyebrow">
          <span className="live-dot" aria-hidden="true" />
          {isPersonal ? 'Votre simulation' : 'Actualisé chaque nuit'} · données du {dateLabel(data.asOf)}
        </p>
        <h1>Présidentielle 2027 : le second tour le plus probable</h1>

        {hasDuel && <HeroDuel pair={pair} finalists={finalists} />}
        {!result && <div className="hero-loading" role="status"><span className="loading-ring" />Calcul des simulations…</div>}
        {result && !hasDuel && <p className="hero-missing">{result.error ?? 'Aucun duel de second tour ne ressort de ce scénario.'}</p>}

        <p className="hero-lede">Une estimation qui réunit les sondages, Polymarket, le baromètre des réseaux et Wikipédia. Vous pouvez changer chaque hypothèse.</p>
        <p className="hero-note"><FlaskIcon aria-hidden="true" size={15} />Projection expérimentale, pas un pronostic : le modèle n’est pas encore calibré sur les élections passées.</p>
        <a className="hero-jump" href="#projections" onClick={event => jumpTo(event, 'projections')}>Voir le détail <ArrowDownIcon aria-hidden="true" size={16} /></a>
      </div>
    </section>
  );
}
