import { useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValueEvent } from 'framer-motion'
import Card from './Card'
import SidePanel from './SidePanel'
import ZoomBar from './ZoomBar'
import { canvas, zoom as zoomConfig } from '../config'
import { useCanvasGesture } from '../hooks/useCanvasGesture'
import { SEED_ITEMS } from '../data/seedItems'

export default function Canvas() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedItem = SEED_ITEMS.find((i) => i.id === selectedId) ?? null

  const [zIndices, setZIndices] = useState<Record<string, number>>({})
  const nextZ = useRef(1)
  function bringToFront(id: string) {
    setZIndices((prev) => ({ ...prev, [id]: nextZ.current++ }))
  }

  const { canvasRef, zoomMV, panX, panY, zoomTo } = useCanvasGesture()

  const [bgStyle, setBgStyle] = useState(() => ({
    backgroundSize: `${canvas.dotSpacing}px ${canvas.dotSpacing}px`,
    backgroundPosition: '0px 0px',
  }))

  function syncDots() {
    const z = zoomMV.get()
    const spacing = canvas.dotSpacing * z
    const ox = panX.get() % spacing
    const oy = panY.get() % spacing
    setBgStyle({
      backgroundSize: `${spacing}px ${spacing}px`,
      backgroundPosition: `${ox}px ${oy}px`,
    })
  }

  useMotionValueEvent(zoomMV, 'change', syncDots)
  useMotionValueEvent(panX, 'change', syncDots)
  useMotionValueEvent(panY, 'change', syncDots)

  return (
    <div
      ref={canvasRef}
      className="relative w-screen h-screen overflow-hidden cursor-grab"
      onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null) }}
      style={{
        background: canvas.background,
        backgroundImage: `radial-gradient(circle, ${canvas.dotColor} ${canvas.dotSize}px, transparent ${canvas.dotSize}px)`,
        ...bgStyle,
      }}
    >
      <motion.div style={{ x: panX, y: panY, scale: zoomMV, transformOrigin: '0 0' }}>
        {SEED_ITEMS.map((item) => (
          <Card
            key={item.id}
            {...item}
            zIndex={zIndices[item.id] ?? 0}
            getZoom={() => zoomMV.get()}
            onTap={() => setSelectedId(item.id)}
            onBringToFront={() => bringToFront(item.id)}
          />
        ))}
      </motion.div>

      <ZoomBar
        zoomMV={zoomMV}
        onZoomIn={() => zoomTo(zoomMV.get() + zoomConfig.step)}
        onZoomOut={() => zoomTo(zoomMV.get() - zoomConfig.step)}
        onReset={() => zoomTo(zoomConfig.initial)}
      />

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
