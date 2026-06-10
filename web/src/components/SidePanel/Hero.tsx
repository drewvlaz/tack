import { useState } from 'react';
import { useSetPrimaryImage } from '../../hooks/server/useSetPrimaryImage';
import Pulse from '../shared/Pulse';
import ImageLightbox from './ImageLightbox';

type HeroImage = { id: string; url: string };

type HeroProps = {
  images: HeroImage[];
  alt: string;
  // Placement id (board_items.id post-fold). The image strip + setPrimary
  // belong to this placement.
  id: string;
  boardId: string;
};

export default function Hero({ images, alt, id, boardId }: HeroProps) {
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroAspect, setHeroAspect] = useState(1);
  const [heroLoaded, setHeroLoaded] = useState(false);
  const [trackedHeroUrl, setTrackedHeroUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const setPrimary = useSetPrimaryImage();

  const hero = images[heroIdx] ?? images[0] ?? null;
  const heroUrl = hero?.url ?? null;

  if (heroUrl !== trackedHeroUrl) {
    setTrackedHeroUrl(heroUrl);
    setHeroLoaded(false);
  }

  function handleHeroLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      setHeroAspect(naturalWidth / naturalHeight);
    }
    setHeroLoaded(true);
  }

  function handleSetPrimary(imageId: string) {
    setPrimary.mutate({ id, imageId, boardId });
    // After reorder the primary becomes index 0; refocus the hero there.
    setHeroIdx(0);
  }

  return (
    <>
      <div
        className="bg-surface-muted relative"
        style={{ aspectRatio: heroAspect }}
      >
        {heroUrl ? (
          <img
            src={heroUrl}
            alt={alt}
            className={`w-full cursor-zoom-in object-cover transition-opacity duration-200 ${heroLoaded ? 'opacity-100' : 'opacity-0'}`}
            style={{ aspectRatio: heroAspect }}
            onLoad={handleHeroLoad}
            onClick={() => setLightboxOpen(true)}
          />
        ) : null}
        {!heroLoaded && <Pulse className="absolute inset-0" />}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/20 to-transparent" />
      </div>

      {images.length > 1 && (
        <div className="border-border bg-surface-raised border-b px-7 py-3">
          <div className="flex gap-2 overflow-x-auto">
            {images.map((img, i) => {
              const isPrimary = i === 0;
              return (
                <ThumbButton
                  key={img.id}
                  url={img.url}
                  active={i === heroIdx}
                  isPrimary={isPrimary}
                  onSelect={() => setHeroIdx(i)}
                  onSetPrimary={
                    isPrimary ? null : () => handleSetPrimary(img.id)
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      <ImageLightbox
        open={lightboxOpen}
        src={heroUrl}
        alt={alt}
        onClose={() => setLightboxOpen(false)}
      />
    </>
  );
}

type ThumbButtonProps = {
  url: string;
  active: boolean;
  isPrimary: boolean;
  onSelect: () => void;
  onSetPrimary: (() => void) | null;
};

function ThumbButton({
  url,
  active,
  isPrimary,
  onSelect,
  onSetPrimary,
}: ThumbButtonProps) {
  return (
    <div
      className={`group/thumb relative shrink-0 overflow-hidden rounded-md ring-1 transition-all ${
        active ? 'ring-fg/40' : 'ring-border/60'
      }`}
      style={{ width: 56, height: 56 }}
    >
      <button
        type="button"
        onClick={onSelect}
        className={`block h-full w-full transition-opacity ${active ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
        aria-label="Show this image"
      >
        <Thumbnail url={url} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSetPrimary?.();
        }}
        disabled={!onSetPrimary}
        aria-label={isPrimary ? 'Primary image' : 'Set as primary image'}
        title={isPrimary ? 'Primary image' : 'Set as primary'}
        className={`absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white transition-opacity ${
          isPrimary
            ? 'opacity-100'
            : 'opacity-0 group-hover/thumb:opacity-100 focus:opacity-100'
        } ${onSetPrimary ? 'cursor-pointer hover:bg-black/70' : 'cursor-default'}`}
      >
        <StarIcon filled={isPrimary} />
      </button>
    </div>
  );
}

function Thumbnail({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  const [trackedUrl, setTrackedUrl] = useState(url);
  if (url !== trackedUrl) {
    setTrackedUrl(url);
    setLoaded(false);
  }

  return (
    <div className="relative h-full w-full">
      {!loaded && <Pulse className="absolute inset-0" />}
      <img
        src={url}
        alt=""
        className={`h-full w-full object-cover transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        draggable={false}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d="M6 1.2l1.49 3.02 3.34.49-2.42 2.36.57 3.32L6 8.83l-2.98 1.57.57-3.32L1.17 4.71l3.34-.49z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
