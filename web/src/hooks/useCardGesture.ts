import { useRef } from 'react'
import { useDrag } from '@use-gesture/react'
import { useMotionValue, useSpring } from 'framer-motion'
import { spring } from '../config'

type Options = {
  initialX?: number
  initialY?: number
  getZoom?: () => number
  onTap?: () => void
  onDragEnd?: (x: number, y: number) => void
}

export function useCardGesture({
  initialX = 0,
  initialY = 0,
  getZoom = () => 1,
  onTap,
  onDragEnd,
}: Options) {
  const ref = useRef<HTMLDivElement>(null)

  const x = useMotionValue(initialX)
  const y = useMotionValue(initialY)
  const springX = useSpring(x, spring.card)
  const springY = useSpring(y, spring.card)

  useDrag(
    ({ delta: [dx, dy], tap, last }) => {
      if (tap) {
        onTap?.()
        return
      }

      const z = getZoom()
      const nx = x.get() + dx / z
      const ny = y.get() + dy / z

      if (last) {
        springX.set(nx)
        springY.set(ny)
        onDragEnd?.(nx, ny)
      } else {
        x.set(nx)
        y.set(ny)
        springX.jump(nx)
        springY.jump(ny)
      }
    },
    { target: ref },
  )

  return { ref, x, y, springX, springY }
}
