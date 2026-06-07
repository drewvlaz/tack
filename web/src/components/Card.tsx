import { forwardRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';
import { spring } from '../config';
import { useCardGesture } from '../hooks/useCardGesture';
import { useCardResize } from '../hooks/useCardResize';

type CardProps = {
  id: string;
  title: string;
  price: number | null;
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
  onResizeEnd?: (next: { x: number; y: number; width: number; height: number }) => void;
};

export default function Card({
  title,
  price,
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

  if (isSkeleton) {
    return (
      <motion.div
        ref={ref}
        style={{ x: springX, y: springY, width: springW, zIndex, touchAction: 'none' }}
        className="absolute rounded-2xl bg-surface-raised shadow-md select-none overflow-hidden"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <motion.div className="bg-surface-muted" style={{ height: springH }} />
        <div className="p-3 space-y-2">
          <div className="h-3 rounded bg-surface-muted w-3/4" />
          <div className="h-3 rounded bg-surface-muted w-1/3" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      onPointerDown={onBringToFront}
      style={{ x: springX, y: springY, width: springW, zIndex, touchAction: 'none' }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="group absolute cursor-grab rounded-2xl bg-surface-raised shadow-md active:cursor-grabbing select-none"
    >
      <div className="relative">
        <motion.img
          src={imageUrl}
          alt={title}
          style={{ height: springH }}
          className="w-full rounded-t-2xl object-cover"
          draggable={false}
        />
        <ResizeHandle ref={nwRef} corner="nw" />
        <ResizeHandle ref={neRef} corner="ne" />
        <ResizeHandle ref={swRef} corner="sw" />
        <ResizeHandle ref={seRef} corner="se" />
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-fg">{title}</p>
        {price !== null && <p className="mt-0.5 text-sm text-fg-muted">${price.toFixed(2)}</p>}
      </div>
    </motion.div>
  );
}

const cornerClass: Record<'nw' | 'ne' | 'sw' | 'se', string> = {
  nw: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize',
  ne: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize',
  sw: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize',
  se: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize',
};

const ResizeHandle = forwardRef<HTMLDivElement, { corner: 'nw' | 'ne' | 'sw' | 'se' }>(
  ({ corner }, ref) => (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ touchAction: 'none' }}
      className={`absolute z-10 flex h-4 w-4 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 ${cornerClass[corner]}`}
    >
      <div className="h-2 w-2 rounded-full bg-fg ring-2 ring-surface-raised" />
    </div>
  ),
);
ResizeHandle.displayName = 'ResizeHandle';
