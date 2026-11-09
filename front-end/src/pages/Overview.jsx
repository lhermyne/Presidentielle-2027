import { useEffect, useMemo, useRef, useState } from 'react';
import { allConfigurations, DEFAULT_SETTINGS, DEFAULT_WEIGHTS, forecast, settingsFrom, SOURCE_IDS } from '../../../model/forecast.mjs';
import { downloadJson } from '../lib/format.js';
import { activePresetId } from '../lib/presets.js';
import { shareForecast } from '../lib/share.js';
import { duelCardData, shareCardBlob, shareSentence } from '../lib/shareCard.js';
import DuelHero from '../components/DuelHero.jsx';
import HistoryChart from '../components/HistoryChart.jsx';
import LabDrawer from '../components/LabDrawer.jsx';
import Laboratory from '../components/Laboratory.jsx';
import MobileBar from '../components/MobileBar.jsx';
import { Reveal } from '../components/Motion.jsx';
import Results from '../components/Results.jsx';
import SourceBreakdown from '../components/SourceBreakdown.jsx';

const OBSOLETE_PARAMS = ['reseaux', 'amplification', 'incertitude', 'incertitude-ajoutee'];
const SETTING_PARAMS = ['candidats', 'memoire', 'echeance', ...SOURCE_IDS.map(id => `poids-${id}`)];
const MESSAGE_DURATION = 6000;
const SHARE_IMAGE_DELAY = 400;
const DEFAULT_SHARE_SENTENCE = 'Présidentielle 2027 : sondages, marchés et signaux en ligne réunis dans une projection expérimentale.';

function initialSettings() {
  const query = new URLSearchParams(window.location.search);
  // Les liens antérieurs aux curseurs indépendants (sans poids du baromètre) reviennent à la référence.
  const weights = query.has('poids-barometer')
    ? Object.fromEntries(SOURCE_IDS.map(id => [id, query.get(`poids-${id}`) ?? 0]))
    : undefined;
  return settingsFrom({ halfLife: query.get('memoire') ?? DEFAULT_SETTINGS.halfLife, weights, horizon: query.get('echeance') !== 'non' });
}

// L'adresse reste nue tant que les réglages sont ceux de la référence ; seul un réglage modifié y apparaît.
function syncUrl(configurationId, defaultConfigurationId, settings) {
  const url = new URL(window.location.href);
  for (const name of [...OBSOLETE_PARAMS, ...SETTING_PARAMS]) url.searchParams.delete(name);

  if (configurationId !== defaultConfigurationId) url.searchParams.set('candidats', configurationId ?? '');
  if (settings.halfLife !== DEFAULT_SETTINGS.halfLife) url.searchParams.set('memoire', settings.halfLife);
  if (!settings.horizon) url.searchParams.set('echeance', 'non');
  if (SOURCE_IDS.some(id => settings.weights[id] !== DEFAULT_WEIGHTS[id])) {
    for (const id of SOURCE_IDS) url.searchParams.set(`poids-${id}`, settings.weights[id]);
  }

  window.history.replaceState(window.history.state, '', url);
}

export default function Overview({ data, labOpen, onLabChange }) {
  const configurations = useMemo(() => allConfigurations(data), [data]);
  const [configurationId, setConfigurationId] = useState(() => {
    const requested = new URLSearchParams(window.location.search).get('candidats');
    return configurations.some(c => c.id === requested) ? requested : configurations[0]?.id;
  });
  const [settings, setSettings] = useState(initialSettings);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(true);
  const [shareImage, setShareImage] = useState(null);
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
    syncUrl(configurationId, configurations[0]?.id, settings);
    return () => clearTimeout(timer);
  }, [data, configurations, configurationId, settings]);

  // L'image est préparée d'avance : le partage natif doit partir aussitôt après le geste du visiteur.
  useEffect(() => {
    const card = pending ? null : duelCardData(result);
    if (!card) {
      setShareImage(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const blob = await shareCardBlob(card, data.asOf);
      if (!cancelled) setShareImage({ blob, sentence: shareSentence(card) });
    }, SHARE_IMAGE_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [result, pending, data.asOf]);

  const applyWeights = weights => setSettings(previous => ({ ...previous, weights: { ...weights } }));

  const share = async () => {
    const shareMessage = await shareForecast({
      blob: shareImage?.blob ?? null,
      sentence: shareImage?.sentence ?? DEFAULT_SHARE_SENTENCE,
      url: window.location.href,
    });
    if (shareMessage) notify(shareMessage);
  };
  const exportScenario = () => downloadJson({ generatedAt: data.generatedAt, observations: data, result }, `lhermyne-scenario-${data.asOf}.json`);
  const isPersonal = !activePresetId(settings.weights) || !settings.horizon || configurationId !== configurations[0]?.id;

  return (
    <div className="home">
      <DuelHero result={result} data={data} isPersonal={isPersonal} />

      <div className="home-content">
        <Reveal>
          <Results result={result} pending={pending} settings={settings} onPreset={applyWeights} />
        </Reveal>

        {!result?.error && (
          <Reveal>
            <HistoryChart data={data} result={result} />
          </Reveal>
        )}
      </div>

      <LabDrawer
        open={labOpen}
        onClose={() => onLabChange(false)}
        result={result}
        pending={pending}
        onExport={exportScenario}
        onShare={share}
        message={message}
      >
        <Laboratory configurations={configurations} configurationId={configurationId} setConfigurationId={setConfigurationId} settings={settings} setSettings={setSettings} data={data} />
        <SourceBreakdown result={pending ? null : result} data={data} />
      </LabDrawer>

      <MobileBar onOpenLab={() => onLabChange(true)} onShare={share} />
      {!labOpen && message && <p className="toast" role="status">{message}</p>}
      <span className="sr-only" role="status">{pending ? 'Calcul du scénario en cours.' : 'Scénario actualisé.'}</span>
    </div>
  );
}
