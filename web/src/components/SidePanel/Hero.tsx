import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { useState } from 'react';
import { useSetPrimaryImage } from '../../hooks/server/useSetPrimaryImage';
import { useHotkey } from '../../hooks/useHotkey';
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

  const canCycle = images.length > 1;
  const cycle = (dir: 1 | -1) =>
    setHeroIdx((i) => (i + dir + images.length) % images.length);

  // Arrow keys cycle the hero. Modal scope while the lightbox is open so we
  // beat the panel-level Escape/Delete handlers; panel scope otherwise.
  useHotkey(['ArrowLeft', 'ArrowRight'], (e) => cycle(e.key === 'ArrowLeft' ? -1 : 1), {
    scope: lightboxOpen ? 'modal' : 'panel',
    enabled: canCycle,
  });

  return (
    <>
      <div
        className="bg-surface-muted group/hero relative"
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
        {canCycle && (
          <>
            <CycleButton side="left" onClick={() => cycle(-1)} />
            <CycleButton side="right" onClick={() => cycle(1)} />
            <span
              aria-hidden
              className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium tracking-wider text-white tabular-nums opacity-0 transition-opacity group-hover/hero:opacity-100"
            >
              {heroIdx + 1} / {images.length}
            </span>
          </>
        )}
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
        index={heroIdx}
        total={images.length}
        onCycle={canCycle ? cycle : undefined}
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
        <Star
          size={11}
          strokeWidth={1.4}
          fill={isPrimary ? 'currentColor' : 'none'}
          aria-hidden
        />
      </button>
    </div>
  );
}

function CycleButton({
  side,
  onClick,
}: {
  side: 'left' | 'right';
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={side === 'left' ? 'Previous image' : 'Next image'}
      className={`absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition-all hover:bg-black/70 group-hover/hero:opacity-100 focus-visible:opacity-100 ${
        side === 'left' ? 'left-3' : 'right-3'
      }`}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
    </button>
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

