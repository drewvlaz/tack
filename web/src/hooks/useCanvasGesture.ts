import { useRef } from 'react'
import { useDrag, useWheel } from '@use-gesture/react'
import { useMotionValue } from 'framer-motion'
import { zoom as zoomConfig } from '../config'

export function useCanvasGesture() {
  const canvasRef = useRef<HTMLDivElement>(null)
  const zoomMV = useMotionValue<number>(zoomConfig.initial)
  const panX = useMotionValue(0)
  const panY = useMotionValue(0)

  useWheel(
    ({ delta: [, dy], event }) => {
      event.preventDefault()

      const oldZoom = zoomMV.get()
      const newZoom = Math.min(
        zoomConfig.max,
        Math.max(zoomConfig.min, oldZoom * (1 - dy * zoomConfig.sensitivity)),
      )

      // zoom toward cursor: keep the world point under the cursor fixed
      const rect = canvasRef.current!.getBoundingClientRect()
      const cursorX = (event as WheelEvent).clientX - rect.left
      const cursorY = (event as WheelEvent).clientY - rect.top
      const ratio = newZoom / oldZoom

      panX.set(cursorX - (cursorX - panX.get()) * ratio)
      panY.set(cursorY - (cursorY - panY.get()) * ratio)
      zoomMV.set(newZoom)
    },
    { target: canvasRef, eventOptions: { passive: false } },
  )

  const isPanningRef = useRef(false)

  useDrag(
    ({ event, delta: [dx, dy], first, last }) => {
      if (first) {
        isPanningRef.current = event.target === canvasRef.current
        if (isPanningRef.current && canvasRef.current) {
          canvasRef.current.style.cursor = 'grabbing'
        }
      }
      if (!isPanningRef.current) return
      panX.set(panX.get() + dx)
      panY.set(panY.get() + dy)
      if (last) {
        if (canvasRef.current) canvasRef.current.style.cursor = ''
        isPanningRef.current = false
      }
    },
    { target: canvasRef },
  )

  function zoomTo(target: number) {
    const el = canvasRef.current
    if (!el) return
    const oldZoom = zoomMV.get()
    const newZoom = Math.min(zoomConfig.max, Math.max(zoomConfig.min, target))
    const ratio = newZoom / oldZoom
    const cx = el.clientWidth / 2
    const cy = el.clientHeight / 2
    panX.set(cx - (cx - panX.get()) * ratio)
    panY.set(cy - (cy - panY.get()) * ratio)
    zoomMV.set(newZoom)
  }

  return { canvasRef, zoomMV, panX, panY, zoomTo }
}
