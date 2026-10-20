import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router';
import { ArrowUpRightIcon, ChartLineUpIcon, ArrowClockwiseIcon } from '@phosphor-icons/react';
import Overview from './pages/Overview.jsx';
import Sources from './pages/Sources.jsx';
import Method from './pages/Method.jsx';
import { dateLabel } from './lib/format.js';

export default function App() {
  const [state, setState] = useState({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const location = useLocation();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/latest.json`, { signal: controller.signal, cache: 'no-cache' })
      .then(response => { if (!response.ok) throw new Error('Données temporairement indisponibles.'); return response.json(); })
      .then(data => {
        if (data.schemaVersion !== 1 || !Array.isArray(data.polls) || !data.polls.length || !Array.isArray(data.candidates) || !Array.isArray(data.sources) || !Array.isArray(data.social?.platforms)) throw new Error('Le fichier de données est incomplet.');
        setState({ data, error: null });
      })
      .catch(error => { if (error.name !== 'AbortError') setState({ data: null, error: error.message }); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'auto' });
    else window.scrollTo(0, 0);
    document.title = `${location.pathname === '/sources' ? 'Les sources' : location.pathname === '/methode' ? 'La méthode' : 'Présidentielle 2027'} | L’Hermyne`;
  }, [location.pathname, location.hash]);
  const { data, error } = state;
  const cached = data?.sources.filter(source => ['cached', 'unavailable'].includes(source.status)) ?? [];
  return <>
    <a className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>Aller au contenu</a>
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" to="/" aria-label="L'Hermyne, accueil"><span className="brand-mark"><ChartLineUpIcon aria-hidden="true" size={24} weight="bold" /></span><span>L’Hermyne<span className="brand-divider">/</span><strong>2027</strong></span></Link>
        <nav aria-label="Navigation principale">
          <NavLink to="/" end>Vue d’ensemble</NavLink><NavLink to="/sources">Les sources</NavLink><NavLink to="/methode">La méthode</NavLink>
        </nav>
        <a className="barometer-link" href="https://lhermyne.github.io/L_Hermyne/monitor_dashboard.html" target="_blank" rel="noreferrer">Le baromètre <ArrowUpRightIcon aria-hidden="true" size={16} /></a>
      </div>
    </header>
    <main id="main-content" tabIndex={-1}>
      {!data && !error && <div className="loading-state" role="status"><span className="loading-ring" />Lecture des dernières données…</div>}
      {error && <div className="empty-state" role="alert"><h1>Les données se font attendre.</h1><p>{error}</p><button className="button primary" onClick={() => setAttempt(attempt + 1)}><ArrowClockwiseIcon aria-hidden="true" size={18} />Réessayer</button></div>}
      {data && <>
        {cached.length > 0 && <div className="source-warning" role="status">{cached.length} source{cached.length > 1 ? 's' : ''} en cache ou indisponible{cached.length > 1 ? 's' : ''}. Les dates de collecte restent visibles dans <Link to="/sources">les sources</Link>.</div>}
        <Routes>
          <Route path="/" element={<Overview data={data} />} />
          <Route path="/sources" element={<Sources data={data} />} />
          <Route path="/methode" element={<Method />} />
          <Route path="*" element={<div className="empty-state"><h1>Cette page n’existe pas.</h1><Link className="button primary" to="/">Revenir aux prévisions</Link></div>} />
        </Routes>
      </>}
    </main>
    <footer className="site-footer"><span><strong>L’Hermyne</strong> · Comprendre les dynamiques politiques.</span><span>{data ? `Données du ${dateLabel(data.asOf)}` : 'Présidentielle 2027'}<Link to="/methode">Modèle expérimental</Link></span></footer>
  </>;
}
