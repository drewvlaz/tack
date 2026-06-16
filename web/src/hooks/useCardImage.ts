import { useCallback, useState } from 'react';

// Per-card image lazy-load state machine. A card's image fetch is gated by
// whether the card has been near the viewport at least once; once promoted
// to 'requested' we don't demote on scroll-away (sticky), so panning a
// loaded card off-screen never unsets its src.
//
// When the imageUrl prop changes (e.g. user re-parses an item), the FSM
// resets: we either start a new fetch immediately (if the card is currently
// in view) or wait for the next intersection.
export type ImgStatus = 'idle' | 'requested' | 'loaded';

const LAZY_LOAD_MARGIN = '300px';

function useInView(skip: boolean) {
  const [inView, setInView] = useState(false);
  const ref = useCallback(
    (node: Element | null) => {
      if (!node || skip) {
        return;
      }
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setInView(true);
            obs.disconnect();
          }
        },
        { rootMargin: LAZY_LOAD_MARGIN },
      );
      obs.observe(node);
      return () => obs.disconnect();
    },
    [skip],
  );
  return [ref, inView] as const;
}

export function useCardImage(imageUrl: string, initiallyVisible: boolean) {
  const [inViewRef, inView] = useInView(initiallyVisible);
  const seen = initiallyVisible || inView;

  const [status, setStatus] = useState<ImgStatus>(
    initiallyVisible ? 'requested' : 'idle',
  );
  const [trackedImgUrl, setTrackedImgUrl] = useState(imageUrl);
  // Reset whenever the source URL changes — the previous load is stale.
  if (imageUrl !== trackedImgUrl) {
    setTrackedImgUrl(imageUrl);
    setStatus(seen ? 'requested' : 'idle');
  }
  // Promote idle → requested as soon as the card enters the viewport.
  if (status === 'idle' && seen) {
    setStatus('requested');
  }

  return {
    inViewRef,
    status,
    markLoaded: () => setStatus('loaded'),
  };
}
