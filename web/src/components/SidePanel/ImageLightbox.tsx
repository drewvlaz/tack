import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { spring } from '../../config';
import { useHotkey } from '../../hooks/useHotkey';

type ImageLightboxProps = {
  open: boolean;
  src: string | null;
  alt?: string;
  onClose: () => void;
  // Cycling is optional — single-image items pass nothing here.
  index?: number;
  total?: number;
  onCycle?: (dir: 1 | -1) => void;
};

export default function ImageLightbox({
  open,
  src,
  alt,
  onClose,
  index,
  total,
  onCycle,
}: ImageLightboxProps) {
  useHotkey('Escape', onClose, {
    scope: 'modal',
    enabled: open,
    allowInInputs: true,
  });

  const canCycle = !!onCycle && (total ?? 0) > 1;

  return (
    <AnimatePresence>
      {open && src && (
        <motion.div
          className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          {/* Wrapper sizes to the actual rendered image so the arrows can hug
              its edges instead of the viewport's. */}
          <div
            className="relative flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <motion.img
              src={src}
              alt={alt ?? ''}
              className="block max-h-[calc(100vh-8rem)] max-w-[calc(100vw-9rem)] rounded-lg object-contain shadow-2xl"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', ...spring.panel }}
              draggable={false}
            />
            {canCycle && (
              <>
                <LightboxCycleButton
                  side="left"
                  onClick={() => onCycle(-1)}
                />
                <LightboxCycleButton
                  side="right"
                  onClick={() => onCycle(1)}
                />
                {typeof index === 'number' && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium tracking-wider text-white tabular-nums backdrop-blur-md"
                  >
                    {index + 1} / {total}
                  </span>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function LightboxCycleButton({
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
      className={`absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:bg-white/20 ${
        side === 'left' ? '-left-16' : '-right-16'
      }`}
    >
      <Icon size={22} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
