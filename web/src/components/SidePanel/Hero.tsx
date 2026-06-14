import { ChevronLeft, ChevronRight } from 'lucide-react';
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

  const canCycle = images.length > 1;
  const cycle = (dir: 1 | -1) =>
    setHeroIdx((i) => (i + dir + images.length) % images.length);

  // setPrimary re-sorts so the chosen image lands at index 0 — keep heroIdx
  // pointing at it so the rail keeps showing the picture the user just promoted.
  function promoteActive() {
    const img = images[heroIdx];
    if (!img) {
      return;
    }
    setPrimary.mutate({ id, imageId: img.id, boardId });
    setHeroIdx(0);
  }

  // Arrow keys cycle the hero. Modal scope while the lightbox is open so we
  // beat the panel-level Escape/Delete handlers; panel scope otherwise.
  useHotkey(['ArrowLeft', 'ArrowRight'], (e) => cycle(e.key === 'ArrowLeft' ? -1 : 1), {
    scope: lightboxOpen ? 'modal' : 'panel',
    enabled: canCycle,
  });

  const activeIsCover = heroIdx === 0;

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
        {canCycle && (
          <>
            <CycleButton side="left" onClick={() => cycle(-1)} />
            <CycleButton side="right" onClick={() => cycle(1)} />
          </>
        )}
      </div>

      {canCycle && (
        <div className="px-7 pt-4 pb-1">
          <CaptionRow
            index={heroIdx + 1}
            total={images.length}
            activeIsCover={activeIsCover}
            onPromote={promoteActive}
          />
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1.5">
            {images.map((img, i) => (
              <ThumbButton
                key={img.id}
                url={img.url}
                active={i === heroIdx}
                label={`Show frame ${i + 1}`}
                onSelect={() => setHeroIdx(i)}
              />
            ))}
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

type CaptionRowProps = {
  index: number;
  total: number;
  activeIsCover: boolean;
  onPromote: () => void;
};

function CaptionRow({
  index,
  total,
  activeIsCover,
  onPromote,
}: CaptionRowProps) {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return (
    <div className="text-fg-subtle flex items-center justify-between text-[10px] font-medium tracking-[0.16em] uppercase">
      <span className="tabular-nums">
        Frame {pad(index)} <span aria-hidden>/</span> {pad(total)}
      </span>
      {activeIsCover ? (
        <span className="text-fg-muted">Cover</span>
      ) : (
        <button
          type="button"
          onClick={onPromote}
          className="text-fg-muted hover:text-fg rounded-sm tracking-[0.16em] uppercase outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus"
        >
          Set as cover
        </button>
      )}
    </div>
  );
}

type ThumbButtonProps = {
  url: string;
  active: boolean;
  label: string;
  onSelect: () => void;
};

function ThumbButton({ url, active, label, onSelect }: ThumbButtonProps) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={onSelect}
        aria-label={label}
        aria-pressed={active}
        className={`ring-border/60 block h-14 w-14 overflow-hidden rounded-md ring-1 outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-focus ${active ? 'opacity-100' : 'opacity-60 hover:opacity-100'}`}
      >
        <Thumbnail url={url} />
      </button>
      <span
        aria-hidden
        className={`bg-focus pointer-events-none absolute -bottom-1 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
      />
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
      className={`absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white opacity-0 outline-none transition-all hover:bg-black/70 group-hover/hero:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus ${side === 'left' ? 'left-3' : 'right-3'}`}
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
