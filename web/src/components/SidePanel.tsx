import { motion } from 'framer-motion'
import { panel, spring } from '../config'
import { type CanvasItem } from '../hooks/useBoardItems'

type SidePanelProps = {
  item: CanvasItem
  onClose: () => void
}

export default function SidePanel({ item, onClose }: SidePanelProps) {
  return (
    <motion.aside
      className="absolute right-0 top-0 z-20 h-full overflow-y-auto bg-white shadow-2xl"
      style={{ width: panel.width }}
      initial={{ x: panel.width }}
      animate={{ x: 0 }}
      exit={{ x: panel.width }}
      transition={spring.panel}
    >
      <div className="relative">
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt={item.title ?? ''}
            className="w-full object-cover"
            style={{ height: 420 }}
          />
        )}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-neutral-600 backdrop-blur-sm hover:bg-white"
        >
          ✕
        </button>
      </div>

      <div className="p-6">
        {item.title && <h2 className="text-lg font-semibold text-neutral-900">{item.title}</h2>}
        {item.price !== null && (
          <p className="mt-1 text-base text-neutral-500">
            {item.currency} {item.price.toFixed(2)}
          </p>
        )}
      </div>
    </motion.aside>
  )
}
