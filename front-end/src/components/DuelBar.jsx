import { useEntered } from './Motion.jsx';
import { percent, shortName } from '../lib/format.js';

// Place minimale, en points de barre, laissée à une étiquette avant qu'elle ne change de côté.
const LABEL_ROOM = 20;

// Le minimum s'écrit à gauche de sa borne et le maximum à droite : les deux ne se chevauchent jamais.
// Près d'un bord, l'étiquette passe de l'autre côté de sa borne pour rester dans la barre.
function anchorOf(position, side) {
  if (side === 'lower') return position < LABEL_ROOM ? 'start' : 'end';
  return position > 100 - LABEL_ROOM ? 'end' : 'start';
}

// Repère placé au-dessus d'une borne de la zone hachurée.
function RangeMark({ position, side, label, color, visible }) {
  return (
    <span
      className={`duel-mark duel-mark-${anchorOf(position, side)}${visible ? ' in' : ''}`}
      style={{ left: `${position}%` }}
    >
      <i className="duel-mark-dot" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

// Bornes de la marge du candidat de gauche, lisibles directement au-dessus de la barre.
function RangeMarks({ left, lower, upper, visible }) {
  return (
    <div className="duel-marks" aria-hidden="true">
      <RangeMark position={lower} side="lower" color={left.color} visible={visible} label={`min. ${percent(lower)}`} />
      <RangeMark position={upper} side="upper" color={left.color} visible={visible} label={`max. ${percent(upper)}`} />
    </div>
  );
}

// Barre partagée entre deux finalistes : elle part de 50 % puis rejoint les scores.
// La zone hachurée montre où le score peut varier ; sans marge connue, elle disparaît.
// Avec showRange, les bornes de cette zone sont écrites au-dessus de la barre.
export default function DuelBar({ left, right, score, lower = score, upper = score, showRange = false }) {
  const entered = useEntered();
  const start = entered ? lower : 50;
  const end = entered ? upper : 50;
  const hasMargin = upper > lower;
  const margin = hasMargin
    ? ` Zone hachurée : le score de ${shortName(left.name)} peut varier de ${percent(lower)} à ${percent(upper)}.`
    : '';

  return (
    <div className={`duel-gauge${showRange && hasMargin ? ' has-marks' : ''}`}>
      {showRange && hasMargin && <RangeMarks left={left} lower={lower} upper={upper} visible={entered} />}
      <div
        className="duel-bar"
        role="img"
        aria-label={`${left.name} ${percent(score)}, ${right.name} ${percent(100 - score)}.${margin}`}
        style={{ '--candidate-left': left.color, '--candidate-right': right.color }}
      >
        <span className="duel-left" style={{ width: `${start}%` }} />
        <span className="duel-doubt" style={{ left: `${start}%`, width: `${end - start}%` }} />
        <span className="duel-majority" />
      </div>
      <span className="duel-fifty" aria-hidden="true">50 %</span>
    </div>
  );
}
