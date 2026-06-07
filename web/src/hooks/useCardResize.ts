import { useRef } from 'react'
import { useDrag } from '@use-gesture/react'
import type { MotionValue } from 'framer-motion'

type Corner = 'nw' | 'ne' | 'sw' | 'se'

type Options = {
  x: MotionValue<number>
  y: MotionValue<number>
  width: MotionValue<number>
  height: MotionValue<number>
  springX: MotionValue<number>
  springY: MotionValue<number>
  springWidth: MotionValue<number>
  springHeight: MotionValue<number>
  getZoom?: () => number
  onResizeEnd?: (next: { x: number; y: number; width: number; height: number }) => void
}

const MIN_WIDTH = 120
const MAX_WIDTH = 600
const MIN_HEIGHT = 100
const MAX_HEIGHT = 800

export function useCardResize({
  x,
  y,
  width,
  height,
  springX,
  springY,
  springWidth,
  springHeight,
  getZoom = () => 1,
  onResizeEnd,
}: Options) {
  const nwRef = useRef<HTMLDivElement>(null)
  const neRef = useRef<HTMLDivElement>(null)
  const swRef = useRef<HTMLDivElement>(null)
  const seRef = useRef<HTMLDivElement>(null)
  const start = useRef({ x: 0, y: 0, w: 0, h: 0 })

  function apply(corner: Corner, first: boolean, last: boolean, mx: number, my: number) {
    if (first) {
      start.current = { x: x.get(), y: y.get(), w: width.get(), h: height.get() }
    }
    const z = getZoom()
    const { x: sx, y: sy, w: sw, h: sh } = start.current

    const signX = corner === 'sw' || corner === 'nw' ? -1 : 1
    const signY = corner === 'ne' || corner === 'nw' ? -1 : 1

    const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, sw + signX * (mx / z)))
    const newH = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, sh + signY * (my / z)))

    const newX = signX === -1 ? sx - (newW - sw) : sx
    const newY = signY === -1 ? sy - (newH - sh) : sy

    x.set(newX)
    y.set(newY)
    width.set(newW)
    height.set(newH)

    if (last) {
      springX.set(newX)
      springY.set(newY)
      springWidth.set(newW)
      springHeight.set(newH)
      onResizeEnd?.({ x: newX, y: newY, width: newW, height: newH })
    } else {
      springX.jump(newX)
      springY.jump(newY)
      springWidth.jump(newW)
      springHeight.jump(newH)
    }
  }

  useDrag(
    ({ first, last, movement: [mx, my] }) => apply('nw', first, last, mx, my),
    { target: nwRef },
  )
  useDrag(
    ({ first, last, movement: [mx, my] }) => apply('ne', first, last, mx, my),
    { target: neRef },
  )
  useDrag(
    ({ first, last, movement: [mx, my] }) => apply('sw', first, last, mx, my),
    { target: swRef },
  )
  useDrag(
    ({ first, last, movement: [mx, my] }) => apply('se', first, last, mx, my),
    { target: seRef },
  )

  return { nwRef, neRef, swRef, seRef }
}
