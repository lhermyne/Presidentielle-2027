import { percent, shortName } from '../lib/format.js';

function Avatar({ row }) {
  if (!row) return null;
  return (
    <span className="fact-avatar" style={{ '--candidate': row.color }}>
      {row.photo
        ? <img src={`${import.meta.env.BASE_URL}${row.photo}`} alt="" width="40" height="40" loading="lazy" />
        : <span>{row.name.split(' ').map(word => word[0]).slice(0, 2).join('')}</span>}
    </span>
  );
}

function Fact({ label, rows, title, value, detail }) {
  return (
    <div className="fact">
      <span className="fact-label">{label}</span>
      <div className="fact-body">
        <span className="fact-avatars">{rows.map(row => <Avatar key={row.id} row={row} />)}</span>
        <div>
          <strong className="fact-title">{title}</strong>
          <span className="fact-value">{value}</span>
        </div>
      </div>
      <small>{detail}</small>
    </div>
  );
}

function victoryLabel(row) {
  return row.winUpper - row.winLower > 0.15
    ? `${percent(row.winLower).replace(' %', '')}–${percent(row.winUpper)}`
    : percent(row.winLower);
}

function duelDetail(duel, rows) {
  if (!duel.estimate || rows.length !== 2) return 'des simulations aboutissent à ce duel, non sondé';
  const [first, second] = rows;
  return `des simulations · sondages : ${percent(duel.estimate.scores[first.id])} contre ${percent(duel.estimate.scores[second.id])}`;
}

export default function KeyFacts({ result }) {
  if (!result?.rows?.length) {
    return <div className="key-facts is-loading" aria-hidden="true"><div className="fact" /><div className="fact" /><div className="fact" /></div>;
  }
  const byId = Object.fromEntries(result.rows.map(row => [row.id, row]));
  const leader = result.rows[0];
  const favourite = [...result.rows].sort((a, b) => b.winUpper - a.winUpper)[0];
  const duel = result.pairs?.[0];
  const duelRows = duel
    ? duel.key.split('|').map(id => byId[id]).filter(Boolean).sort((a, b) => b.score - a.score)
    : [];

  return (
    <section className="key-facts" aria-label="L’essentiel du scénario">
      <Fact
        label="En tête au premier tour"
        rows={[leader]}
        title={leader.name}
        value={percent(leader.score)}
        detail={`Intervalle simulé : ${percent(leader.lower).replace(' %', '')} à ${percent(leader.upper)}`}
      />
      {duel && (
        <Fact
          label="Second tour le plus probable"
          rows={duelRows}
          title={duelRows.map(row => shortName(row.name)).join(' / ')}
          value={percent(duel.probability)}
          detail={duelDetail(duel, duelRows)}
        />
      )}
      <Fact
        label="Favori pour la victoire"
        rows={[favourite]}
        title={favourite.name}
        value={victoryLabel(favourite)}
        detail={duel?.estimate ? 'Sondages de duels et Polymarket' : 'Fourchette élargie : duels peu documentés'}
      />
    </section>
  );
}
