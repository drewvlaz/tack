import { motion, useTransform, type MotionValue } from 'framer-motion'

type ZoomBarProps = {
  zoomMV: MotionValue<number>
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export default function ZoomBar({ zoomMV, onZoomIn, onZoomOut, onReset }: ZoomBarProps) {
  const label = useTransform(zoomMV, (z) => `${Math.round(z * 100)}%`)

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-full bg-white px-2 py-1.5 shadow-lg ring-1 ring-neutral-200">
      <ZoomButton onClick={onZoomOut} disabled={false} aria-label="Zoom out">
        −
      </ZoomButton>

      <button
        onClick={onReset}
        className="min-w-[52px] text-center text-xs font-medium tabular-nums text-neutral-600 hover:text-neutral-900 transition-colors"
      >
        <motion.span>{label}</motion.span>
      </button>

      <ZoomButton onClick={onZoomIn} aria-label="Zoom in">
        +
      </ZoomButton>
    </div>
  )
}

function ZoomButton({
  children,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
      {...props}
    >
      {children}
    </button>
  )
}
