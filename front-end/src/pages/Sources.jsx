import { Link } from 'react-router';
import { ArrowUpRightIcon, DownloadSimpleIcon, DatabaseIcon } from '@phosphor-icons/react';
import { dateLabel, downloadJson, integer, percent } from '../lib/format.js';

const STATUS = {
  ok: ['Disponible', 'ok'],
  partial: ['Partiellement à jour', 'warning'],
  cached: ['Dernier succès conservé', 'warning'],
  unavailable: ['Indisponible', 'warning'],
  not_connected: ['Non branché', 'neutral'],
};
const BAROMETER_PLATFORMS = ['instagram', 'twitter', 'tiktok', 'facebook'];
const PLATFORM_LABELS = { instagram: 'Instagram', twitter: 'X (Twitter)', tiktok: 'TikTok', facebook: 'Facebook' };
const BAROMETER_URL = 'https://lhermyne.github.io/L_Hermyne/monitor_dashboard.html';
const GOOGLE_TRENDS_API_URL = 'https://developers.google.com/search/apis/trends';

function sourceDescription(source, data) {
  switch (source.id) {
    case 'polls':
      return 'Collecte automatique du CSV Sondax, agrégateur de résultats publiés par les instituts. Chaque enquête conserve son document source ; configurations et duels restent séparés.';
    case 'barometer':
      return 'Le baromètre L’Hermyne suit les abonnés des personnalités sur quatre réseaux. Sa dynamique pondérée ajuste le socle sondé ; elle n’est pas une chance de victoire.';
    case 'polymarket':
      return 'Prix de victoire finale lus directement dans l’API publique Gamma. Ils repondèrent les trajectoires simulées ; aucun prix n’est transformé en intention de vote.';
    case 'wikipedia':
      return `Consultations quotidiennes des articles Wikipédia en français, robots exclus, via l’API publique et gratuite de Wikimedia. ${Object.keys(data.wikipedia?.momentum ?? {}).length} personnalité(s) avec une série exploitable ; seule l’évolution sur 7 jours face aux 21 précédents est utilisée.`;
    case 'google-trends':
      return 'L’API officielle de Google Trends reste réservée à quelques testeurs. Le flux public des recherches en forte hausse est archivé chaque jour, mais il ne contient presque jamais de candidat : la source reste à 0 % et ne s’active que si au moins deux candidats y apparaissent.';
    default:
      return source.note ?? '';
  }
}

function worstStatus(statuses) {
  if (statuses.every(status => status === 'ok')) return 'ok';
  if (statuses.some(status => status === 'ok' || status === 'cached')) return 'partial';
  return 'unavailable';
}

// Les quatre historiques du baromètre forment une seule source, présentée par réseau.
function sourceCards(data) {
  const platforms = data.sources.filter(source => BAROMETER_PLATFORMS.includes(source.id));
  const others = data.sources.filter(source => !BAROMETER_PLATFORMS.includes(source.id));
  const trendsSilent = !Object.keys(data.trends?.interest ?? {}).length;
  const cards = others.map(source => {
    if (source.id === 'google-trends') {
      const status = trendsSilent && source.status === 'ok' ? 'not_connected' : source.status;
      return { ...source, status, documentationUrl: GOOGLE_TRENDS_API_URL };
    }
    if (source.id === 'polymarket') return { ...source, documentationUrl: data.market?.url ?? source.url };
    return source;
  });
  if (!platforms.length) return cards;
  const barometer = {
    id: 'barometer',
    title: 'Baromètre des réseaux',
    status: worstStatus(platforms.map(source => source.status)),
    fetchedAt: platforms.map(source => source.fetchedAt).filter(Boolean).sort().at(-1),
    platforms,
    documentationUrl: BAROMETER_URL,
  };
  const pollsIndex = cards.findIndex(source => source.id === 'polls');
  cards.splice(pollsIndex + 1, 0, barometer);
  return cards;
}

function SourceCard({ source, data }) {
  const [label, className] = STATUS[source.status] ?? ['À vérifier', 'warning'];
  return (
    <section className="panel source-card">
      <div><h2>{source.title}</h2><span className={`source-status ${className}`}>{label}</span></div>
      <p>{sourceDescription(source, data)}</p>
      <dl>
        <div><dt>Dernière collecte réussie</dt><dd>{dateLabel(source.fetchedAt)}</dd></div>
        {source.platforms?.map(platform => (
          <div key={platform.id}>
            <dt>{PLATFORM_LABELS[platform.id] ?? platform.id}</dt>
            <dd>{platform.status === 'ok' ? dateLabel(platform.observedThrough) : STATUS[platform.status]?.[0] ?? 'À vérifier'}</dd>
          </div>
        ))}
        {source.observedThrough && <div><dt>Dernière observation</dt><dd>{dateLabel(source.observedThrough)}</dd></div>}
        {source.license && <div><dt>Licence des données</dt><dd>{source.license}</dd></div>}
      </dl>
      {source.attribution && <p className="attribution"><a href={source.attributionUrl} target="_blank" rel="noreferrer">{source.attribution}</a></p>}
      {source.error && source.status !== 'ok' && <p className="source-error">La collecte récente a échoué. Les dernières données réussies sont conservées.</p>}
      <a className="source-link" href={source.documentationUrl ?? source.url} target="_blank" rel="noreferrer">
        {source.id === 'barometer' ? 'Ouvrir le baromètre L’Hermyne' : 'Consulter la source'} <ArrowUpRightIcon aria-hidden="true" size={16} />
      </a>
    </section>
  );
}

export default function Sources({ data }) {
  const polls = [...data.polls].sort((a, b) => b.fieldEnd.localeCompare(a.fieldEnd)).slice(0, 16);
  const captured = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(data.generatedAt));
  return <div className="page-content document-page"><div className="page-context"><span>LES DONNÉES OUVERTES</span><span>Provenance et fraîcheur</span></div><div className="document-intro"><h1>Remonter à la source.</h1><p>Chaque chiffre conserve son origine. Une collecte en échec utilise la dernière observation disponible et le signale.</p><button className="button" onClick={() => downloadJson(data, `lhermyne-observations-${data.asOf}.json`)}><DownloadSimpleIcon aria-hidden="true" size={18} />Télécharger les observations</button></div>
    <div className="source-summary"><DatabaseIcon aria-hidden="true" size={22} /><p><strong>{integer(data.polls.length)} configurations-sondages</strong> · {data.candidates.length} personnalités · Collecte du {captured}, heure de Paris.</p></div>
    <div className="sources-grid">
      {sourceCards(data).map(source => <SourceCard key={source.id} source={source} data={data} />)}
    </div>
    <section className="panel poll-table-panel"><div className="panel-heading"><div><span className="section-label">LES OBSERVATIONS</span><h2>Dernières configurations publiées.</h2></div></div><p className="metric-description">Plusieurs lignes peuvent venir d’une même enquête. Le moteur les regroupe avant toute pondération.</p><div className="table-scroll" tabIndex={0} role="region" aria-label="Tableau des derniers sondages"><table><thead><tr><th scope="col">Terrain</th><th scope="col">Institut</th><th scope="col">Tour</th><th scope="col">Candidats</th><th scope="col">Source</th></tr></thead><tbody>{polls.map(poll => <tr key={`${poll.id}-${poll.round}-${poll.configuration}`}><td>{dateLabel(poll.fieldEnd, true)}</td><td>{poll.institute}</td><td>{poll.round === 1 ? 'Premier' : 'Second'}</td><td>{Object.keys(poll.scores).length}</td><td><a href={poll.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Document du sondage ${poll.institute} du ${dateLabel(poll.fieldEnd)}, tour ${poll.round}, configuration ${poll.configuration}`}>Document <ArrowUpRightIcon aria-hidden="true" size={14} /></a></td></tr>)}</tbody></table></div><p className="source-caption">Sondax, d’après Wikipédia · Données dérivées sous CC BY-SA 4.0 · {data.rejectedPolls.length} groupe ou ligne rejeté lors du contrôle de cohérence.</p></section>
    {data.market && <section className="panel poll-table-panel"><div className="panel-heading"><div><span className="section-label">LECTURE DU MARCHÉ</span><h2>Prix, écarts et liquidité.</h2></div></div><p className="metric-description">Les prix restent bruts : aucun ajustement pour les faire totaliser artificiellement 100 %. Capture du {dateLabel(data.market.capturedAt)}.</p><div className="table-scroll" tabIndex={0} role="region" aria-label="Données Polymarket"><table><thead><tr><th scope="col">Issue</th><th scope="col">Prix de victoire</th><th scope="col">Écart achat/vente</th><th scope="col">Liquidité déclarée</th></tr></thead><tbody>{data.market.markets.slice(0, 10).map(market => <tr key={market.id}><td><a href={market.url} target="_blank" rel="noreferrer">{market.name} <ArrowUpRightIcon aria-hidden="true" size={14} /></a></td><td>{percent(market.probability)}</td><td>{market.spread === null ? 'Indisponible' : `${(market.spread * 100).toFixed(1)} cents`}</td><td>{market.liquidity === null ? 'Indisponible' : `${integer(Math.round(market.liquidity))} $`}</td></tr>)}</tbody></table></div></section>}
    <p className="standalone-note">L’historique des présidentielles précédentes servira à la calibration. Aucun coefficient historique n’est présenté comme validé dans cette version. <Link to="/methode">Voir les limites du modèle.</Link></p>
  </div>;
}
