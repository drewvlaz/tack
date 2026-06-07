import { useState } from 'react';
import ImageLightbox from './ImageLightbox';

type SidePanelHeroProps = {
  imageUrls: string[];
  alt: string;
};

export default function SidePanelHero({ imageUrls, alt }: SidePanelHeroProps) {
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroAspect, setHeroAspect] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const heroUrl = imageUrls[heroIdx] ?? imageUrls[0] ?? null;

  function handleHeroLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth > 0 && naturalHeight > 0) {
      setHeroAspect(naturalWidth / naturalHeight);
    }
  }

  return (
    <>
      <div className="relative bg-surface-muted">
        {heroUrl ? (
          <img
            src={heroUrl}
            alt={alt}
            className="w-full cursor-zoom-in object-cover"
            style={{ aspectRatio: heroAspect }}
            onLoad={handleHeroLoad}
            onClick={() => setLightboxOpen(true)}
          />
        ) : (
          <div style={{ aspectRatio: heroAspect }} />
        )}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/20 to-transparent" />
      </div>

      {imageUrls.length > 1 && (
        <div className="border-b border-border bg-surface-raised px-7 py-3">
          <div className="flex gap-2 overflow-x-auto">
            {imageUrls.map((url, i) => (
              <button
                key={url}
                onClick={() => setHeroIdx(i)}
                className={`shrink-0 overflow-hidden rounded-md ring-1 transition-all ${
                  i === heroIdx
                    ? 'ring-fg/40'
                    : 'ring-border/60 opacity-60 hover:opacity-100'
                }`}
                style={{ width: 56, height: 56 }}
              >
                <img
                  src={url}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
            ))}
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
