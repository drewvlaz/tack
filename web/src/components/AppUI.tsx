import { AnimatePresence } from 'framer-motion'
import SidePanel from './SidePanel'
import { useCanvasStore } from '../store/canvas'

export default function AppUI() {
  const { items, selectedId, setSelectedId } = useCanvasStore()
  const selectedItem = items.find((i) => i.id === selectedId) ?? null

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <AnimatePresence>
        {selectedItem && (
          <SidePanel
            key={selectedItem.id}
            item={selectedItem}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
