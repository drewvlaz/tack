import { motion, useMotionValue, useSpring } from 'framer-motion';
import { forwardRef, useCallback, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { spring } from '../../config';
import { useCardGesture } from '../../hooks/interaction/useCardGesture';
import { useCardResize } from '../../hooks/interaction/useCardResize';

type CardProps = {
  id: string;
  title: string;
  imageUrl: string;
  initialX?: number;
  initialY?: number;
  width: number;
  height: number;
  zIndex?: number;
  isSkeleton?: boolean;
  // Canvas seeds true when the card's rect intersects the visible viewport at
  // mount; lets us mount the <img> on the first frame instead of waiting for
  // an IntersectionObserver tick. Also drives `fetchpriority="high"` on those.
  initiallyVisible?: boolean;
  getZoom?: () => number;
  onTap?: () => void;
  onBringToFront?: () => void;
  onDragEnd?: (x: number, y: number) => void;
  onResizeEnd?: (next: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
};

type ImgStatus = 'idle' | 'requested' | 'loaded';

export default function Card({
  title,
  imageUrl,
  initialX,
  initialY,
  width,
  height,
  zIndex = 0,
  isSkeleton = false,
  initiallyVisible = false,
  getZoom,
  onTap,
  onBringToFront,
  onDragEnd,
  onResizeEnd,
}: CardProps) {
  const w = useMotionValue(width);
  const h = useMotionValue(height);
  const springW = useSpring(w, spring.card);
  const springH = useSpring(h, spring.card);

  const { ref, x, y, springX, springY } = useCardGesture({
    initialX,
    initialY,
    getZoom,
    onTap,
    onDragEnd,
  });

  const { nwRef, neRef, swRef, seRef } = useCardResize({
    x,
    y,
    width: w,
    height: h,
    springX,
    springY,
    springWidth: springW,
    springHeight: springH,
    getZoom,
    onResizeEnd,
  });

  // Image load is a 3-state FSM that fuses visibility + decode:
  //   idle      — off-screen, no <img> mounted yet (or imageUrl changed and we
  //               haven't re-decided yet)
  //   requested — in viewport, <img src> set, decoding in flight
  //   loaded    — decoded, fully opaque
  //
  // `useInView` with rootMargin=300px and triggerOnce=true flips us to
  // 'requested' the first time the card crosses the lookahead margin. Once
  // promoted, panning off-screen does NOT revert — sticky-load avoids
  // re-decode flicker on re-pan.
  const [inViewRef, inView] = useInView({
    rootMargin: '300px',
    triggerOnce: true,
    skip: initiallyVisible,
  });
  const seen = initiallyVisible || inView;
  const [status, setStatus] = useState<ImgStatus>(
    initiallyVisible ? 'requested' : 'idle',
  );
  const [trackedImgUrl, setTrackedImgUrl] = useState(imageUrl);
  if (imageUrl !== trackedImgUrl) {
    setTrackedImgUrl(imageUrl);
    setStatus(seen ? 'requested' : 'idle');
  }
  if (status === 'idle' && seen) {
    setStatus('requested');
  }

  // Merge the gesture ref with the IntersectionObserver callback ref onto the
  // outer motion.div.
  const setOuterRef = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      inViewRef(node);
    },
    [ref, inViewRef],
  );

  if (isSkeleton) {
    return (
      <motion.div
        ref={ref}
        style={{
          x: springX,
          y: springY,
          width: springW,
          height: springH,
          zIndex,
          touchAction: 'none',
        }}
        className="bg-surface-muted absolute overflow-hidden rounded-2xl shadow-md select-none"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
    );
  }

  return (
    <motion.div
      ref={setOuterRef}
      onPointerDown={onBringToFront}
      style={{
        x: springX,
        y: springY,
        width: springW,
        zIndex,
        touchAction: 'none',
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
      className="group absolute cursor-grab rounded-2xl shadow-md select-none active:cursor-grabbing"
    >
      {status !== 'loaded' && (
        <motion.div
          style={{ height: springH }}
          className="bg-surface-muted absolute top-0 left-0 block w-full rounded-2xl"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      {status !== 'idle' && imageUrl && (
        <motion.img
          src={imageUrl}
          alt={title}
          width={width}
          height={height}
          style={{ height: springH, opacity: status === 'loaded' ? 1 : 0 }}
          className="block w-full rounded-2xl object-cover transition-opacity duration-200"
          draggable={false}
          decoding="async"
          fetchPriority={initiallyVisible ? 'high' : 'auto'}
          onLoad={() => setStatus('loaded')}
        />
      )}
      <ResizeHandle ref={nwRef} corner="nw" />
      <ResizeHandle ref={neRef} corner="ne" />
      <ResizeHandle ref={swRef} corner="sw" />
      <ResizeHandle ref={seRef} corner="se" />
    </motion.div>
  );
}

const cornerClass: Record<'nw' | 'ne' | 'sw' | 'se', string> = {
  nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  ne: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
};

const ResizeHandle = forwardRef<
  HTMLDivElement,
  { corner: 'nw' | 'ne' | 'sw' | 'se' }
>(({ corner }, ref) => (
  <div
    ref={ref}
    onPointerDown={(e) => e.stopPropagation()}
    style={{ touchAction: 'none' }}
    className={`absolute z-10 flex h-4 w-4 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 ${cornerClass[corner]}`}
  >
    <div className="bg-fg h-2 w-2 rounded-full" />
  </div>
));
ResizeHandle.displayName = 'ResizeHandle';
