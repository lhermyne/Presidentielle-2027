import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowDownIcon, ArrowUpRightIcon, DownloadSimpleIcon, ShareNetworkIcon, FlaskIcon } from '@phosphor-icons/react';
import { forecast, listConfigurations, settingsFrom, SOURCE_IDS } from '../../../model/forecast.mjs';
import { dateLabel, downloadJson } from '../lib/format.js';
import Results from '../components/Results.jsx';
import Laboratory from '../components/Laboratory.jsx';
import HistoryChart from '../components/HistoryChart.jsx';
import SourceBreakdown from '../components/SourceBreakdown.jsx';
import KeyFacts from '../components/KeyFacts.jsx';
import DuelsPanel from '../components/DuelsPanel.jsx';

const OBSOLETE_PARAMS = ['reseaux', 'amplification'];

function initialSettings() {
  const query = new URLSearchParams(window.location.search);
  // Les liens antérieurs aux curseurs indépendants (sans poids du baromètre) reviennent à la référence.
  const weights = query.has('poids-barometer')
    ? Object.fromEntries(SOURCE_IDS.map(id => [id, query.get(`poids-${id}`) ?? 0]))
    : undefined;
  return settingsFrom({ halfLife: query.get('memoire') ?? 21, weights, uncertainty: query.get('incertitude') ?? 4 });
}

function syncUrl(configurationId, settings) {
  const url = new URL(window.location.href);
  url.searchParams.set('candidats', configurationId ?? '');
  url.searchParams.set('memoire', settings.halfLife);
  for (const id of SOURCE_IDS) url.searchParams.set(`poids-${id}`, settings.weights[id]);
  url.searchParams.set('incertitude', settings.uncertainty);
  for (const name of OBSOLETE_PARAMS) url.searchParams.delete(name);
  window.history.replaceState(window.history.state, '', url);
}

function scrollToId(event, id) {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'auto' });
}

export default function Overview({ data }) {
  const configurations = useMemo(() => listConfigurations(data), [data]);
  const [configurationId, setConfigurationId] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('candidats');
    return configurations.some(c => c.id === requested) ? requested : configurations[0]?.id;
  });
  const [settings, setSettings] = useState(initialSettings);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(true);
  const [message, setMessage] = useState('');
  const worker = useRef(null);
  const requestId = useRef(0);
  const noticeTimer = useRef(null);

  const notify = text => {
    clearTimeout(noticeTimer.current);
    setMessage(text);
    noticeTimer.current = setTimeout(() => setMessage(''), 6000);
  };

  useEffect(() => {
    if (typeof Worker !== 'undefined') {
      worker.current = new Worker(new URL('../../../model/worker.mjs', import.meta.url), { type: 'module' });
      worker.current.onmessage = event => {
        if (event.data.requestId !== requestId.current) return;
        setResult(event.data.result ?? { error: event.data.error });
        setPending(false);
      };
      worker.current.onerror = () => {
        setResult({ error: 'Le calcul a été interrompu. Rechargez la page pour réessayer.' });
        setPending(false);
      };
    }
    return () => {
      worker.current?.terminate();
      worker.current = null;
      clearTimeout(noticeTimer.current);
    };
  }, []);

  useEffect(() => {
    setPending(true);
    const current = ++requestId.current;
    const timer = setTimeout(() => {
      if (worker.current) {
        worker.current.postMessage({ requestId: current, data, configurationId, settings });
      } else {
        setResult(forecast(data, configurationId, settings));
        setPending(false);
      }
    }, 140);
    syncUrl(configurationId, settings);
    return () => clearTimeout(timer);
  }, [data, configurationId, settings]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify('Lien copié : mêmes réglages, données les plus récentes lors de l’ouverture.');
    } catch {
      notify('La copie automatique est indisponible. Copiez l’adresse de cette page pour partager vos réglages.');
    }
  };
  const exportScenario = () => downloadJson({ generatedAt: data.generatedAt, observations: data, result }, `lhermyne-scenario-${data.asOf}.json`);
  const lastPoll = result?.baseline?.latest;

  return (
    <div className="page-content">
      <div className="page-context"><span>OBSERVATOIRE ÉLECTORAL</span><span>France · Présidentielle 2027</span></div>
      <div className="page-intro">
        <div>
          <h1>Présidentielle <span>2027.</span></h1>
          <p>Sondages, marchés et signaux en ligne réunis dans une simulation transparente. Réglez les hypothèses, le calcul suit.</p>
        </div>
        <div className="intro-aside">
          <span className="experimental-badge"><FlaskIcon aria-hidden="true" size={15} />Modèle expérimental</span>
          <span>Actualisé le {dateLabel(data.asOf, true)}</span>
          <Link to="/sources">Voir la provenance des données <ArrowUpRightIcon aria-hidden="true" size={15} /></Link>
        </div>
      </div>

      <KeyFacts result={result} />

      <div className="data-strip">
        <div><span className="stat-number">{result?.baseline?.pollCount ?? '…'}</span><span>enquêtes compatibles<small>dans la configuration sélectionnée</small></span></div>
        <div><span className="stat-number">{data.social.platforms.length}<span>/4</span></span><span>réseaux du baromètre<small>historique depuis {dateLabel(data.social.historyStart, true)}</small></span></div>
        <div><span className="stat-number date-stat">{result ? dateLabel(lastPoll, true) : '…'}</span><span>dernier terrain<small>la date de mesure de l’opinion</small></span></div>
        <a className="jump-link" href="#explorer" onClick={event => scrollToId(event, 'explorer')}>Explorer les résultats <ArrowDownIcon aria-hidden="true" size={17} /></a>
      </div>

      <div className="workspace-heading" id="explorer">
        <span className="workspace-description">Une prévision conditionnelle à une liste de candidats.</span>
        <a className="mobile-lab-link" href="#laboratoire" onClick={event => scrollToId(event, 'laboratoire')}>Les réglages <ArrowDownIcon aria-hidden="true" size={15} /></a>
        <div className="action-group">
          <button className="button" onClick={exportScenario} disabled={!result || result.error || pending}><DownloadSimpleIcon aria-hidden="true" size={17} />Exporter</button>
          <button className="button" onClick={share}><ShareNetworkIcon aria-hidden="true" size={17} />Partager</button>
        </div>
      </div>
      <div className="dashboard-grid">
        <Results result={result} pending={pending} />
        <Laboratory configurations={configurations} configurationId={configurationId} setConfigurationId={setConfigurationId} settings={settings} setSettings={setSettings} data={data} />
        {!result?.error && (
          <div className="secondary-grid">
            <HistoryChart data={data} result={result} />
            <DuelsPanel result={result} data={data} />
          </div>
        )}
      </div>

      <SourceBreakdown result={pending ? null : result} data={data} />

      <div className="transparency-note">
        <FlaskIcon aria-hidden="true" size={24} />
        <div>
          <strong>La transparence fait partie du modèle.</strong>
          <p>Paramètres heuristiques, configurations explicites, sources consultables. La validation sur les campagnes précédentes reste à réaliser.</p>
        </div>
        <Link to="/methode">Lire la méthode <ArrowUpRightIcon aria-hidden="true" size={16} /></Link>
      </div>
      <div className="toast" role="status" aria-live="polite">{message}</div>
      <span className="sr-only" role="status">{pending ? 'Calcul du scénario en cours.' : 'Scénario actualisé.'}</span>
    </div>
  );
}
