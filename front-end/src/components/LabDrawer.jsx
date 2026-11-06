import { useEffect, useRef } from 'react';
import { DownloadSimpleIcon, ShareNetworkIcon, XIcon } from '@phosphor-icons/react';
import { AnimatedNumber } from './Motion.jsx';
import { shortName } from '../lib/format.js';

const LIVE_ROWS = 5;

function LiveReadout({ result, pending }) {
  if (!result?.rows?.length) return null;

  return (
    <div className={`lab-live ${pending ? 'is-pending' : ''}`} role="status" aria-label="Premiers scores du scénario">
      {result.rows.slice(0, LIVE_ROWS).map(row => (
        <span key={row.id}>
          <small>{shortName(row.name)}</small>
          <b><AnimatedNumber value={row.score} duration={500} /></b>
        </span>
      ))}
    </div>
  );
}

// Panneau latéral natif : <dialog> gère le focus, la touche Échap et le fond.
export default function LabDrawer({ open, onClose, result, pending, onExport, onShare, message, children }) {
  const dialog = useRef(null);

  useEffect(() => {
    const element = dialog.current;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const closeOnBackdrop = event => {
    if (event.target === dialog.current) onClose();
  };

  return (
    <dialog ref={dialog} className="lab-drawer" aria-labelledby="lab-title" onClose={onClose} onClick={closeOnBackdrop}>
      <div className="lab-drawer-inner">
        <div className="lab-drawer-top">
          <header className="lab-drawer-head">
            <div>
              <h2 id="lab-title">Le laboratoire</h2>
              <p>Changez les hypothèses, le calcul suit.</p>
            </div>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer le laboratoire">
              <XIcon aria-hidden="true" size={20} />
            </button>
          </header>
          <LiveReadout result={result} pending={pending} />
        </div>
        {open && children}
        <footer className="lab-actions">
          <button type="button" className="button" onClick={onExport} disabled={!result || result.error || pending}>
            <DownloadSimpleIcon aria-hidden="true" size={17} />Exporter
          </button>
          <button type="button" className="button" onClick={onShare}>
            <ShareNetworkIcon aria-hidden="true" size={17} />Partager
          </button>
          <p className="lab-message" role="status" aria-live="polite">{message}</p>
        </footer>
      </div>
    </dialog>
  );
}
