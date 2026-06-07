import { motion } from 'framer-motion'
import { card } from '../config'
import { useCardGesture } from '../hooks/useCardGesture'

type CardProps = {
  id: string
  title: string
  price: number | null
  imageUrl: string
  initialX?: number
  initialY?: number
  zIndex?: number
  getZoom?: () => number
  onTap?: () => void
  onBringToFront?: () => void
  onDragEnd?: (x: number, y: number) => void
}

export default function Card({
  title,
  price,
  imageUrl,
  initialX,
  initialY,
  zIndex = 0,
  getZoom,
  onTap,
  onBringToFront,
  onDragEnd,
}: CardProps) {
  const { ref, springX, springY } = useCardGesture({ initialX, initialY, getZoom, onTap, onDragEnd })

  return (
    <motion.div
      ref={ref}
      onPointerDown={onBringToFront}
      style={{ x: springX, y: springY, width: card.width, zIndex, touchAction: 'none' }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="absolute cursor-grab rounded-2xl bg-white shadow-md active:cursor-grabbing select-none"
    >
      <div className="overflow-hidden rounded-t-2xl">
        <img src={imageUrl} alt={title} style={{ height: card.imageHeight }} className="w-full object-cover" draggable={false} />
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium text-neutral-800">{title}</p>
        {price !== null && (
          <p className="mt-0.5 text-sm text-neutral-500">${price.toFixed(2)}</p>
        )}
      </div>
    </motion.div>
  )
}
