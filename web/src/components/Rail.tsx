import { motion, type HTMLMotionProps } from 'framer-motion'
import { useRef, useState, type ReactNode } from 'react'
import { railLimits } from '../store/rails'

type RailProps = {
  side: 'left' | 'right'
  width: number
  onResize: (next: number) => void
  children: ReactNode
} & Omit<HTMLMotionProps<'aside'>, 'style' | 'children'>

export default function Rail({
  side,
  width,
  onResize,
  children,
  className,
  ...motionProps
}: RailProps) {
  const [draft, setDraft] = useState<number | null>(null)
  const startX = useRef(0)
  const startWidth = useRef(0)
  const displayWidth = draft ?? width

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    startX.current = e.clientX
    startWidth.current = width
    setDraft(width)
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (draft === null) return
    const delta = e.clientX - startX.current
    const signed = side === 'left' ? delta : -delta
    const next = Math.max(
      railLimits.min,
      Math.min(railLimits.max, startWidth.current + signed),
    )
    setDraft(next)
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (draft === null) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    onResize(draft)
    setDraft(null)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  const baseClasses =
    'pointer-events-auto absolute top-0 z-20 flex h-full flex-col bg-surface-raised shadow-2xl ring-1 ring-border/60'
  const sideClass = side === 'left' ? 'left-0' : 'right-0'
  const handleSideClass = side === 'left' ? 'right-0' : 'left-0'

  return (
    <motion.aside
      className={`${baseClasses} ${sideClass} ${className ?? ''}`}
      style={{ width: displayWidth }}
      {...motionProps}
    >
      {children}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label={`Resize ${side} rail`}
        role="separator"
        className={`absolute top-0 z-10 h-full w-1.5 cursor-ew-resize transition-colors hover:bg-fg/10 ${handleSideClass}`}
      />
    </motion.aside>
  )
}
