import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatedNumber, useEntered, useFlipList } from './Motion.jsx';
import DuelBar from './DuelBar.jsx';
import Portrait from './Portrait.jsx';
import { dateLabel, integer, percent, shortName } from '../lib/format.js';
import { activePresetId, PRESETS } from '../lib/presets.js';

const TABS = [
  { id: 'score', label: 'Premier tour', description: 'Score estimé de chaque candidat. Le repère montre l’intervalle simulé à 90 %.' },
  { id: 'qualification', label: 'Qualification', description: 'Part des simulations où le candidat termine dans les deux premiers.' },
  { id: 'runoff', label: 'Second tour probable', short: 'Second tour', extra: 'probable', description: 'Les duels qui ressortent des simulations, avec le score estimé de chaque finaliste. La zone hachurée montre où il peut varier.' },
];
const VISIBLE_ROWS = 8;
// En dessous de 1 % des simulations, un duel repose sur trop peu de cas pour être affiché.
const MIN_DUEL_PROBABILITY = 1;
const MAX_OTHER_DUELS = 6;

function metricRows(rows, metric) {
  if (metric === 'score') return rows;
  return [...rows].sort((a, b) => b.qualification - a.qualification || b.score - a.score);
}

function scaleMaximum(rows, metric) {
  if (metric !== 'score') return 100;
  return Math.max(40, Math.ceil(Math.max(...rows.map(row => row.upper)) / 10) * 10);
}

function LadderRow({ row, rank, metric, max, entered }) {
  const value = metric === 'score' ? row.score : row.qualification;
  const position = number => Math.min(100, Math.max(0, number / max * 100));
  const label = metric === 'score'
    ? `${percent(row.score)}, intervalle à 90 % de ${percent(row.lower)} à ${percent(row.upper)}`
    : `qualifié dans ${percent(row.qualification)} des simulations`;

  return (
    <li className="ladder-row" data-flip-id={row.id} style={{ '--candidate': row.color, '--row': rank }}>
      <span className="ladder-rank" aria-hidden="true">{rank + 1}</span>
      <Portrait row={row} />
      <span className="ladder-name">
        <strong>{row.name}</strong>
        <small>{row.party || 'Personnalité testée'}</small>
      </span>
      <span className="ladder-track" role="img" aria-label={`${row.name} : ${label}`}>
        <span className="ladder-fill" style={{ width: `${entered ? position(value) : 0}%` }} />
        {metric === 'score' && (
          <span className="ladder-range" style={{ left: `${position(row.lower)}%`, width: `${position(row.upper) - position(row.lower)}%` }} />
        )}
      </span>
      <span className="ladder-value">
        <b><AnimatedNumber value={value} /></b><em> %</em>
        {metric === 'score' && <small>{percent(row.lower).replace(' %', '')} à {percent(row.upper)}</small>}
      </span>
    </li>
  );
}

function Ladder({ rows, metric }) {
  const [expanded, setExpanded] = useState(false);
  const entered = useEntered();
  const list = useFlipList();
  const sorted = metricRows(rows, metric);
  const visible = expanded ? sorted : sorted.slice(0, VISIBLE_ROWS);
  const max = scaleMaximum(rows, metric);

  return (
    <>
      <ol className="ladder" ref={list}>
        {visible.map((row, index) => <LadderRow key={row.id} row={row} rank={index} metric={metric} max={max} entered={entered} />)}
      </ol>
      {rows.length > VISIBLE_ROWS && (
        <button type="button" className="text-button" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Réduire la liste' : `Voir les ${rows.length} candidats`}
        </button>
      )}
    </>
  );
}

function DuelSide({ row, score, alignEnd }) {
  return (
    <div className={`duel-side ${alignEnd ? 'is-end' : ''}`}>
      <Portrait row={row} />
      <span className="duel-side-name">
        <strong>{shortName(row.name)}</strong>
        <small>{row.party || 'Personnalité testée'}</small>
      </span>
      {Number.isFinite(score) && <b><AnimatedNumber value={score} /><em> %</em></b>}
    </div>
  );
}

function DuelRow({ left, right, score, lower, upper, caption }) {
  return (
    <li className="duel-row">
      <p className="duel-caption">{caption}</p>
      <div className="duel-sides">
        <DuelSide row={left} score={score} />
        <DuelSide row={right} score={Number.isFinite(score) ? 100 - score : undefined} alignEnd />
      </div>
      {Number.isFinite(score)
        ? <DuelBar left={left} right={right} score={score} lower={lower} upper={upper} />
        : <p className="missing-duel">Duel jamais sondé : aucun score projeté.</p>}
    </li>
  );
}

function orderedFinalists(ids, rows) {
  const finalists = rows.filter(row => ids.includes(row.id));
  return finalists.length === 2 ? finalists : null;
}

// Duels sondés que les simulations ne retiennent presque jamais, ajustés par les mêmes sources.
function otherPolledDuels(result) {
  const shown = new Set(result.pairs.filter(pair => pair.probability >= MIN_DUEL_PROBABILITY).map(pair => pair.key));

  return result.polledDuels
    .filter(duel => !shown.has(duel.key))
    .map(duel => ({ ...duel, finalists: orderedFinalists(duel.key.split('|'), result.rows) }))
    .filter(item => item.finalists)
    .sort((a, b) => (b.finalists[0].score + b.finalists[1].score) - (a.finalists[0].score + a.finalists[1].score))
    .slice(0, MAX_OTHER_DUELS);
}

function surveysLabel(estimate) {
  const count = estimate.pollCount;
  return `${count} enquête${count > 1 ? 's' : ''} · dernier terrain le ${dateLabel(estimate.latest, true)}`;
}

function DuelList({ result }) {
  const duels = result.pairs.filter(pair => pair.probability >= MIN_DUEL_PROBABILITY);
  const others = useMemo(() => otherPolledDuels(result), [result]);

  return (
    <>
      <ul className="duel-list">
        {duels.map(pair => {
          const finalists = orderedFinalists(pair.key.split('|'), result.rows);
          if (!finalists) return null;
          const [left] = finalists;
          return (
            <DuelRow
              key={pair.key}
              left={finalists[0]}
              right={finalists[1]}
              score={pair.projection?.scores[left.id]}
              lower={pair.projection?.lower[left.id]}
              upper={pair.projection?.upper[left.id]}
              caption={`Ressort dans ${percent(pair.probability)} des simulations`}
            />
          );
        })}
      </ul>
      {others.length > 0 && (
        <>
          <h3 className="duel-subtitle">Autres duels sondés</h3>
          <p className="duel-subtext">Ces affiches ressortent dans moins de {MIN_DUEL_PROBABILITY} % des simulations. Leurs scores partent des enquêtes du duel, ajustées par les mêmes sources que ci-dessus.</p>
          <ul className="duel-list">
            {others.map(({ key, estimate, projection, finalists }) => (
              <DuelRow
                key={key}
                left={finalists[0]}
                right={finalists[1]}
                score={projection.scores[finalists[0].id]}
                lower={projection.lower[finalists[0].id]}
                upper={projection.upper[finalists[0].id]}
                caption={surveysLabel(estimate)}
              />
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function Tabs({ active, onChange }) {
  const list = useRef(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const measure = () => {
      const tab = list.current?.querySelector('[aria-selected="true"]');
      if (tab) setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);

  const moveWithKeyboard = event => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const index = TABS.findIndex(tab => tab.id === active);
    const next = TABS[(index + step + TABS.length) % TABS.length];
    onChange(next.id);
    list.current?.querySelector(`#tab-${next.id}`)?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label="Indicateur affiché" ref={list} onKeyDown={moveWithKeyboard}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          id={`tab-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={active === tab.id}
          aria-controls="projection-panel"
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
        >
          {tab.short ?? tab.label}
          {tab.extra && <span className="tab-extra"> {tab.extra}</span>}
        </button>
      ))}
      <span className="tabs-indicator" aria-hidden="true" style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }} />
    </div>
  );
}

function PresetSwitch({ settings, onPreset }) {
  const active = activePresetId(settings.weights);

  return (
    <div className="preset-switch" role="group" aria-label="Sources utilisées">
      {PRESETS.map(preset => (
        <button key={preset.id} type="button" aria-pressed={active === preset.id} onClick={() => onPreset(preset.weights)}>
          {preset.label}
        </button>
      ))}
      {!active && <span className="preset-personal">Votre réglage</span>}
    </div>
  );
}

export default function Results({ result, pending, settings, onPreset }) {
  const [tabId, setTabId] = useState('score');

  if (!result) {
    return (
      <section className="projections" id="projections" aria-busy="true">
        <h2>Les projections</h2>
        <p className="projection-loading" role="status"><span className="loading-ring" aria-hidden="true" />Calcul des simulations…</p>
      </section>
    );
  }
  if (result.error) {
    return <section className="projections" id="projections"><h2>Pas de prévision disponible</h2><p className="projection-text">{result.error}</p></section>;
  }

  const tab = TABS.find(item => item.id === tabId);

  return (
    <section className="projections" id="projections" aria-busy={pending}>
      <div className="projection-head">
        <h2 className="sr-only">Les projections</h2>
        <Tabs active={tabId} onChange={setTabId} />
        <PresetSwitch settings={settings} onPreset={onPreset} />
      </div>
      <p className="projection-text">{tab.description}</p>
      <div id="projection-panel" className={`projection-panel ${pending ? 'is-pending' : ''}`} role="tabpanel" aria-labelledby={`tab-${tabId}`}>
        {tabId === 'runoff'
          ? <DuelList result={result} />
          : <Ladder rows={result.rows} metric={tabId} />}
      </div>
      <p className="projection-foot">{integer(result.settings.simulations)} simulations · {result.baseline?.pollCount ?? '…'} enquêtes · dernier terrain le {dateLabel(result.baseline?.latest, true)}. Ces résultats dépendent des candidats retenus.</p>
    </section>
  );
}
