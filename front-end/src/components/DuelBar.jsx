import { useEntered } from './Motion.jsx';
import { percent, shortName } from '../lib/format.js';

// Barre partagée entre deux finalistes : elle part de 50 % puis rejoint les scores.
// La zone hachurée montre où le score peut varier ; sans marge connue, elle disparaît.
export default function DuelBar({ left, right, score, lower = score, upper = score }) {
  const entered = useEntered();
  const start = entered ? lower : 50;
  const end = entered ? upper : 50;
  const hasMargin = upper > lower;
  const margin = hasMargin
    ? ` Zone hachurée : le score de ${shortName(left.name)} peut varier de ${percent(lower)} à ${percent(upper)}.`
    : '';

  return (
    <div className="duel-gauge">
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
