import { useEffect, useState } from 'react'
import { motion, useMotionValueEvent } from 'framer-motion'
import Card from './Card'
import ZoomBar from './ZoomBar'
import { canvas, zoom as zoomConfig } from '../config'
import { apiPatch } from '../api/client'
import { useCanvasGesture } from '../hooks/useCanvasGesture'
import { useBoardItems } from '../hooks/useBoardItems'
import { useCanvasStore } from '../store/canvas'

const BOARD_ID = 'board-1'

export default function Canvas() {
  const { items: fetchedItems, loading } = useBoardItems(BOARD_ID)
  const { items, zIndices, setItems, setSelectedId, bringToFront } = useCanvasStore()

  useEffect(() => {
    if (!loading) setItems(fetchedItems)
  }, [fetchedItems, loading, setItems])

  const { canvasRef, zoomMV, panX, panY, zoomTo } = useCanvasGesture()

  const [bgStyle, setBgStyle] = useState(() => ({
    backgroundSize: `${canvas.dotSpacing}px ${canvas.dotSpacing}px`,
    backgroundPosition: '0px 0px',
  }))

  function syncDots() {
    const z = zoomMV.get()
    const spacing = canvas.dotSpacing * z
    setBgStyle({
      backgroundSize: `${spacing}px ${spacing}px`,
      backgroundPosition: `${panX.get() % spacing}px ${panY.get() % spacing}px`,
    })
  }

  useMotionValueEvent(zoomMV, 'change', syncDots)
  useMotionValueEvent(panX, 'change', syncDots)
  useMotionValueEvent(panY, 'change', syncDots)

  return (
    <div
      ref={canvasRef}
      className="absolute inset-0 z-0 cursor-grab overflow-hidden"
      onClick={(e) => { if (e.target === e.currentTarget) setSelectedId(null) }}
      style={{
        background: canvas.background,
        backgroundImage: `radial-gradient(circle, ${canvas.dotColor} ${canvas.dotSize}px, transparent ${canvas.dotSize}px)`,
        ...bgStyle,
      }}
    >
      <motion.div style={{ x: panX, y: panY, scale: zoomMV, transformOrigin: '0 0' }}>
        {!loading && items.map((item) => (
          <Card
            key={item.id}
            id={item.id}
            title={item.title ?? ''}
            price={item.price}
            imageUrl={item.imageUrl ?? ''}
            initialX={item.x}
            initialY={item.y}
            zIndex={zIndices[item.id] ?? item.zIndex}
            getZoom={() => zoomMV.get()}
            onTap={() => setSelectedId(item.id)}
            onBringToFront={() => bringToFront(item.id)}
            onDragEnd={(x, y) => apiPatch(`/api/board-items/${item.id}`, { x, y }).catch(console.error)}
          />
        ))}
      </motion.div>

      <ZoomBar
        zoomMV={zoomMV}
        onZoomIn={() => zoomTo(zoomMV.get() + zoomConfig.step)}
        onZoomOut={() => zoomTo(zoomMV.get() - zoomConfig.step)}
        onReset={() => zoomTo(zoomConfig.initial)}
      />
    </div>
  )
}
