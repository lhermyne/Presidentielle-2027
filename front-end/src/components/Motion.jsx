import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const EASE_OUT = 'cubic-bezier(.2, .8, .2, 1)';
const FLIP_DURATION = 700;

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function formatNumber(value, digits) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

// Fait défiler un nombre vers sa valeur. Un minuteur garantit la valeur exacte
// même si le navigateur suspend les images (onglet ou panneau masqué).
export function AnimatedNumber({ value, digits = 1, duration = 1100 }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const current = useRef(shown);

  useEffect(() => {
    if (!Number.isFinite(value)) return undefined;

    const finish = () => {
      current.current = value;
      setShown(value);
    };
    if (prefersReducedMotion()) {
      finish();
      return undefined;
    }

    const from = current.current;
    const start = performance.now();
    let frame = 0;
    const tick = now => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 4;
      current.current = from + (value - from) * eased;
      setShown(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const fallback = setTimeout(finish, duration + 150);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
    };
  }, [value, duration]);

  return Number.isFinite(value) ? formatNumber(shown, digits) : 'Indisponible';
}

// Vrai juste après le premier rendu : permet aux barres de partir de leur état initial.
export function useEntered(delay = 60) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return entered;
}

// Technique FLIP, d'après Bar Race Chart (dhxwhy, 21st.dev) : quand l'ordre change,
// chaque ligne glisse de son ancienne position vers la nouvelle.
export function useFlipList() {
  const container = useRef(null);
  const positions = useRef(new Map());

  useLayoutEffect(() => {
    const next = new Map();
    const reduced = prefersReducedMotion();

    for (const element of container.current?.querySelectorAll('[data-flip-id]') ?? []) {
      const id = element.dataset.flipId;
      next.set(id, element.offsetTop);

      const previous = positions.current.get(id);
      const distance = previous === undefined ? 0 : previous - element.offsetTop;
      if (distance && !reduced && element.animate) {
        element.animate(
          [{ transform: `translateY(${distance}px)` }, { transform: 'none' }],
          { duration: FLIP_DURATION, easing: EASE_OUT },
        );
      }
    }
    positions.current = next;
  });

  return container;
}

// Fait apparaître une section à son arrivée à l'écran, une seule fois.
export function Reveal({ as: Tag = 'div', className = '', children, ...props }) {
  const element = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return undefined;
    }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.08 });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, []);

  return <Tag ref={element} className={`reveal ${visible ? 'in' : ''} ${className}`} {...props}>{children}</Tag>;
}
