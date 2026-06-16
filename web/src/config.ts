export const spring = {
  card: { stiffness: 300, damping: 30 },
  panel: { stiffness: 350, damping: 35 },
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
