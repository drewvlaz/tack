import { useMotionValueEvent, type MotionValue } from 'framer-motion';
import { useState } from 'react';
import { canvas } from '../../config';

// The canvas backdrop renders the dot grid as a tiled background-image. When
// the viewport pans or zooms we update background-size/position so the dots
// appear glued to canvas-space — done in React state (one cheap object) rather
// than threading the MVs into style, because background-* aren't animatable
// MVs.
export function useDotGridSync(
  zoomMV: MotionValue<number>,
  panX: MotionValue<number>,
  panY: MotionValue<number>,
): { backgroundSize: string; backgroundPosition: string } {
  const [bgStyle, setBgStyle] = useState(() => ({
    backgroundSize: `${canvas.dotSpacing}px ${canvas.dotSpacing}px`,
    backgroundPosition: '0px 0px',
  }));

  function sync() {
    const z = zoomMV.get();
    const spacing = canvas.dotSpacing * z;
    setBgStyle({
      backgroundSize: `${spacing}px ${spacing}px`,
      backgroundPosition: `${panX.get() % spacing}px ${panY.get() % spacing}px`,
    });
  }

  useMotionValueEvent(zoomMV, 'change', sync);
  useMotionValueEvent(panX, 'change', sync);
  useMotionValueEvent(panY, 'change', sync);

  return bgStyle;
}
