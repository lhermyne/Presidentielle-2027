import { useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontalIcon } from '@phosphor-icons/react';
import { allConfigurations, DEFAULT_SETTINGS, forecast, settingsFrom, SOURCE_IDS } from '../../../model/forecast.mjs';
import { downloadJson } from '../lib/format.js';
import { activePresetId } from '../lib/presets.js';
import DuelHero from '../components/DuelHero.jsx';
import HistoryChart from '../components/HistoryChart.jsx';
import LabDrawer from '../components/LabDrawer.jsx';
import Laboratory from '../components/Laboratory.jsx';
import { Reveal } from '../components/Motion.jsx';
import Results from '../components/Results.jsx';
import SourceBreakdown from '../components/SourceBreakdown.jsx';

const OBSOLETE_PARAMS = ['reseaux', 'amplification', 'incertitude', 'incertitude-ajoutee'];
const MESSAGE_DURATION = 6000;

function initialSettings() {
  const query = new URLSearchParams(window.location.search);
  // Les liens antérieurs aux curseurs indépendants (sans poids du baromètre) reviennent à la référence.
  const weights = query.has('poids-barometer')
    ? Object.fromEntries(SOURCE_IDS.map(id => [id, query.get(`poids-${id}`) ?? 0]))
    : undefined;
  return settingsFrom({ halfLife: query.get('memoire') ?? DEFAULT_SETTINGS.halfLife, weights });
}

function syncUrl(configurationId, settings) {
  const url = new URL(window.location.href);
  url.searchParams.set('candidats', configurationId ?? '');
  url.searchParams.set('memoire', settings.halfLife);
  for (const id of SOURCE_IDS) url.searchParams.set(`poids-${id}`, settings.weights[id]);
  for (const name of OBSOLETE_PARAMS) url.searchParams.delete(name);
  window.history.replaceState(window.history.state, '', url);
}

export default function Overview({ data }) {
  const configurations = useMemo(() => allConfigurations(data), [data]);
  const [configurationId, setConfigurationId] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('candidats');
    return configurations.some(c => c.id === requested) ? requested : configurations[0]?.id;
  });
  const [settings, setSettings] = useState(initialSettings);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(true);
  const [labOpen, setLabOpen] = useState(false);
  const [message, setMessage] = useState('');
  const worker = useRef(null);
  const requestId = useRef(0);
  const messageTimer = useRef(null);

  const notify = text => {
    clearTimeout(messageTimer.current);
    setMessage(text);
    messageTimer.current = setTimeout(() => setMessage(''), MESSAGE_DURATION);
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
      clearTimeout(messageTimer.current);
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

  const applyWeights = weights => setSettings(previous => ({ ...previous, weights: { ...weights } }));

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify('Lien copié : mêmes réglages, données les plus récentes à l’ouverture.');
    } catch {
      notify('Copie automatique indisponible. Copiez l’adresse de la page pour partager vos réglages.');
    }
  };
  const exportScenario = () => downloadJson({ generatedAt: data.generatedAt, observations: data, result }, `lhermyne-scenario-${data.asOf}.json`);
  const isPersonal = !activePresetId(settings.weights) || configurationId !== configurations[0]?.id;

  return (
    <div className="home">
      <DuelHero result={result} data={data} isPersonal={isPersonal} />

      <div className="home-content">
        <Reveal>
          <Results result={result} pending={pending} settings={settings} onPreset={applyWeights} />
        </Reveal>

        <Reveal as="section" className="lab-invite">
          <h2>Et si vous faisiez votre propre calcul ?</h2>
          <button type="button" className="button primary" onClick={() => setLabOpen(true)}>
            <SlidersHorizontalIcon aria-hidden="true" size={18} />Ouvrir le laboratoire
          </button>
        </Reveal>

        {!result?.error && (
          <Reveal>
            <HistoryChart data={data} result={result} />
          </Reveal>
        )}
      </div>

      <LabDrawer
        open={labOpen}
        onClose={() => setLabOpen(false)}
        result={result}
        pending={pending}
        onExport={exportScenario}
        onShare={share}
        message={message}
      >
        <Laboratory configurations={configurations} configurationId={configurationId} setConfigurationId={setConfigurationId} settings={settings} setSettings={setSettings} data={data} />
        <SourceBreakdown result={pending ? null : result} data={data} />
      </LabDrawer>

      <span className="sr-only" role="status">{pending ? 'Calcul du scénario en cours.' : 'Scénario actualisé.'}</span>
    </div>
  );
}
