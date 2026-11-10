import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router';
import { ArrowClockwiseIcon, ArrowUpRightIcon, SlidersHorizontalIcon } from '@phosphor-icons/react';
import Overview from './pages/Overview.jsx';
import Sources from './pages/Sources.jsx';
import Method from './pages/Method.jsx';
import ShareCardPage from './components/ShareCardPage.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import { dateLabel } from './lib/format.js';
import { fetchLiveMarkets, withLiveMarkets } from './lib/liveMarket.js';

const BAROMETER_URL = 'https://lhermyne.github.io/L_Hermyne/monitor_dashboard.html';
const SITE_NAME = 'L’Hermyne - Présidentielle 2027';
const PAGE_TITLES = { '/sources': 'Les sources', '/methode': 'La méthode' };
// Attente maximale des prix Polymarket du moment avant d'afficher le relevé de la nuit.
const LIVE_GRACE_MS = 1500;

function validateData(data) {
  const complete = data.schemaVersion === 1
    && Array.isArray(data.polls) && data.polls.length
    && Array.isArray(data.candidates)
    && Array.isArray(data.sources)
    && Array.isArray(data.social?.platforms);
  if (!complete) throw new Error('Le fichier de données est incomplet.');
  return data;
}

function focusMain(event) {
  event.preventDefault();
  document.getElementById('main-content')?.focus();
}

function Header({ onOpenLab }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label={`${SITE_NAME}, accueil`}>
          <span>L’Hermyne</span>
          <span className="brand-separator" aria-hidden="true"> - </span>
          <span className="brand-subtitle">Présidentielle 2027</span>
        </Link>
        <div className="header-center">
          <nav aria-label="Navigation principale">
            <NavLink to="/" end>Prévision</NavLink>
            <NavLink to="/sources">Sources</NavLink>
            <NavLink to="/methode">Méthode</NavLink>
          </nav>
          <button type="button" className="header-lab" onClick={onOpenLab}>
            <SlidersHorizontalIcon aria-hidden="true" size={17} />
            <span><span className="header-lab-verb">Ouvrir le l</span><span className="header-lab-initial">L</span>aboratoire</span>
          </button>
        </div>
        <div className="header-actions">
          <a className="barometer-link" href={BAROMETER_URL} target="_blank" rel="noreferrer">Le baromètre <ArrowUpRightIcon aria-hidden="true" size={15} /></a>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

function Footer({ data }) {
  return (
    <footer className="site-footer">
      <span>Sondages Sondax (CC BY-SA 4.0), Polymarket, baromètre L’Hermyne et Wikimedia.</span>
      <span className="footer-links">
        {data && <span>Données du {dateLabel(data.asOf)}</span>}
        <Link to="/sources">Sources</Link>
        <Link to="/methode">Modèle expérimental</Link>
      </span>
    </footer>
  );
}

export default function App() {
  const [state, setState] = useState({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const [labOpen, setLabOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const controller = new AbortController();
    // Un échec ou une annulation de Polymarket laisse simplement le relevé de la nuit.
    const live = fetchLiveMarkets(controller.signal).catch(() => null);
    let grace;

    const show = data => {
      if (!controller.signal.aborted) setState({ data, error: null });
    };

    // Le relevé de la nuit s'affiche dès que Polymarket tarde ; les prix du moment le remplacent à leur arrivée.
    const showWithLiveMarkets = nightly => {
      grace = setTimeout(() => show(nightly), LIVE_GRACE_MS);
      live.then(markets => {
        clearTimeout(grace);
        show(markets ? withLiveMarkets(nightly, markets) : nightly);
      });
    };

    fetch(`${import.meta.env.BASE_URL}data/latest.json`, { signal: controller.signal, cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error('Données temporairement indisponibles.');
        return response.json();
      })
      .then(data => showWithLiveMarkets(validateData(data)))
      .catch(error => {
        if (error.name !== 'AbortError') setState({ data: null, error: error.message });
      });
    return () => {
      clearTimeout(grace);
      controller.abort();
    };
  }, [attempt]);

  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
    const pageTitle = PAGE_TITLES[location.pathname];
    document.title = pageTitle ? `${pageTitle} | ${SITE_NAME}` : SITE_NAME;
  }, [location.pathname, location.hash]);

  const openLab = () => {
    if (location.pathname !== '/') navigate('/');
    setLabOpen(true);
  };

  if (location.pathname === '/carte-partage') return <ShareCardPage />;

  const { data, error } = state;
  const stale = data?.sources.filter(source => ['cached', 'unavailable'].includes(source.status)) ?? [];

  return (
    <>
      <a className="skip-link" href="#main-content" onClick={focusMain}>Aller au contenu</a>
      <Header onOpenLab={openLab} />
      <main id="main-content" tabIndex={-1}>
        {!data && !error && <div className="loading-state" role="status"><span className="loading-ring" />Lecture des dernières données…</div>}
        {error && (
          <div className="empty-state" role="alert">
            <h1>Les données se font attendre.</h1>
            <p>{error}</p>
            <button className="button primary" onClick={() => setAttempt(attempt + 1)}><ArrowClockwiseIcon aria-hidden="true" size={18} />Réessayer</button>
          </div>
        )}
        {data && (
          <>
            {stale.length > 0 && (
              <div className="source-warning" role="status">
                {stale.length} source{stale.length > 1 ? 's' : ''} en cache ou indisponible{stale.length > 1 ? 's' : ''}. Les dates de collecte restent visibles dans <Link to="/sources">les sources</Link>.
              </div>
            )}
            <div className="page-fade" key={location.pathname}>
              <Routes location={location}>
                <Route path="/" element={<Overview data={data} labOpen={labOpen} onLabChange={setLabOpen} />} />
                <Route path="/sources" element={<Sources data={data} />} />
                <Route path="/methode" element={<Method />} />
                <Route path="*" element={<div className="empty-state"><h1>Cette page n’existe pas.</h1><Link className="button primary" to="/">Revenir aux prévisions</Link></div>} />
              </Routes>
            </div>
          </>
        )}
      </main>
      <Footer data={data} />
    </>
  );
}
