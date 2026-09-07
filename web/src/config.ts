export const spring = {
  card: { stiffness: 300, damping: 30 },
  panel: { stiffness: 350, damping: 35 },
  // Overdamped on purpose — a large canvas shift that overshoots reads as
  // the whole board bouncing. Critically damped at k=280 is ~33.5.
  panelPan: { stiffness: 280, damping: 38 },
  zoom: { stiffness: 300, damping: 30 },
} as const;

export const zoom = {
  min: 0.2,
  max: 3,
  initial: 1,
  sensitivity: 0.01,
  step: 0.25,
} as const;

export const card = {
  width: 220,
  imageHeight: 280,
} as const;

export const canvas = {
  dotSize: 1,
  dotSpacing: 24,
  dotColor: 'var(--canvas-dot)',
  background: 'var(--surface)',
} as const;
