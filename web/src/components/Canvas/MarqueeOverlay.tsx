// Screen-space dashed selection rectangle. Rendered OUTSIDE the canvas
// transform so the dash and stroke stay 1.5px at any zoom level. Mounted only
// while the marquee gesture is active. Honors prefers-reduced-motion by
// virtue of not animating in/out at all — instant mount/unmount.

type Props = {
  rect: { x: number; y: number; width: number; height: number } | null;
};

export default function MarqueeOverlay({ rect }: Props) {
  if (!rect) {
    return null;
  }
  return (
    <div
      role="presentation"
      aria-hidden
      className="border-fg/40 bg-fg/5 pointer-events-none absolute z-[5] rounded-sm border-[1.5px] border-dashed"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}
