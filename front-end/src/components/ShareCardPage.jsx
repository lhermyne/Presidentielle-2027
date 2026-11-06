import { useEffect, useRef } from 'react';
import { drawShareCard, duelCardData, CARD_HEIGHT, CARD_WIDTH } from '../lib/shareCard.js';

// Page sans habillage, photographiée à la publication pour produire l'aperçu de lien (og.png).
export default function ShareCardPage() {
  const canvas = useRef(null);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/forecast.json`, { cache: 'no-cache' })
      .then(response => response.json())
      .then(result => {
        const card = duelCardData(result);
        return card ? drawShareCard(canvas.current, card, result.asOf) : null;
      })
      .catch(() => {});
  }, []);

  return <canvas ref={canvas} className="share-card" width={CARD_WIDTH} height={CARD_HEIGHT} />;
}
