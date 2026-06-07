import { motion } from 'framer-motion';
import { card } from '../config';
import { useCardGesture } from '../hooks/useCardGesture';

type CardProps = {
  id: string;
  title: string;
  price: number | null;
  imageUrl: string;
  initialX?: number;
  initialY?: number;
  zIndex?: number;
  isSkeleton?: boolean;
  getZoom?: () => number;
  getMaxX?: () => number;
  onTap?: () => void;
  onBringToFront?: () => void;
  onDragEnd?: (x: number, y: number) => void;
};

export default function Card({
  title,
  price,
  imageUrl,
  initialX,
  initialY,
  zIndex = 0,
  isSkeleton = false,
  getZoom,
  getMaxX,
  onTap,
  onBringToFront,
  onDragEnd,
}: CardProps) {
  const { ref, springX, springY } = useCardGesture({ initialX, initialY, getZoom, getMaxX, onTap, onDragEnd });

  if (isSkeleton) {
    return (
      <motion.div
        ref={ref}
        style={{ x: springX, y: springY, width: card.width, zIndex, touchAction: 'none' }}
        className="absolute rounded-2xl bg-surface-raised shadow-md select-none overflow-hidden"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="bg-surface-muted" style={{ height: card.imageHeight }} />
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
      style={{ x: springX, y: springY, width: card.width, zIndex, touchAction: 'none' }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="absolute cursor-grab rounded-2xl bg-surface-raised shadow-md active:cursor-grabbing select-none"
    >
      <div className="overflow-hidden rounded-t-2xl">
        <img src={imageUrl} alt={title} style={{ height: card.imageHeight }} className="w-full object-cover" draggable={false} />
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-fg">{title}</p>
        {price !== null && <p className="mt-0.5 text-sm text-fg-muted">${price.toFixed(2)}</p>}
      </div>
    </motion.div>
  );
}
