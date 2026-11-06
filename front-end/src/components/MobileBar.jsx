import { createPortal } from 'react-dom';
import { ShareNetworkIcon, SlidersHorizontalIcon } from '@phosphor-icons/react';

// Rendue dans <body> : la transition de page créerait sinon un repère pour position: fixed.
export default function MobileBar({ onOpenLab, onShare }) {
  return createPortal(
    <div className="mobile-bar">
      <button type="button" className="button primary" onClick={onOpenLab}>
        <SlidersHorizontalIcon aria-hidden="true" size={18} />Ouvrir le laboratoire
      </button>
      <button type="button" className="button" onClick={onShare} aria-label="Partager">
        <ShareNetworkIcon aria-hidden="true" size={18} /><span className="mobile-bar-share-label">Partager</span>
      </button>
    </div>,
    document.body,
  );
}
