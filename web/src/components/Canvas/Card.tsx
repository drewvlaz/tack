import { motion, useMotionValue, useSpring } from 'framer-motion';
import { forwardRef, useState } from 'react';
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

export default function Card({
  title,
  imageUrl,
  initialX,
  initialY,
  width,
  height,
  zIndex = 0,
  isSkeleton = false,
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

  const [imgLoaded, setImgLoaded] = useState(false);
  const [trackedImgUrl, setTrackedImgUrl] = useState(imageUrl);
  if (imageUrl !== trackedImgUrl) {
    setTrackedImgUrl(imageUrl);
    setImgLoaded(false);
  }

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
      ref={ref}
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
      {!imgLoaded && (
        <motion.div
          style={{ height: springH }}
          className="bg-surface-muted absolute top-0 left-0 block w-full rounded-2xl"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <motion.img
        src={imageUrl}
        alt={title}
        style={{ height: springH, opacity: imgLoaded ? 1 : 0 }}
        className="block w-full rounded-2xl object-cover transition-opacity duration-200"
        draggable={false}
        onLoad={() => setImgLoaded(true)}
      />
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
