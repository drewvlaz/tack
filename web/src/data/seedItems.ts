import { type PanelItem } from '../components/SidePanel'

export type CanvasItem = PanelItem & { initialX: number; initialY: number }

export const SEED_ITEMS: CanvasItem[] = [
  {
    id: '1',
    title: 'Linen Overshirt',
    price: 128,
    imageUrl: 'https://picsum.photos/seed/shirt/300/400',
    initialX: 80,
    initialY: 80,
  },
  {
    id: '2',
    title: 'Wide-Leg Trousers',
    price: 215,
    imageUrl: 'https://picsum.photos/seed/pants/300/400',
    initialX: 340,
    initialY: 120,
  },
  {
    id: '3',
    title: 'Leather Tote',
    price: 340,
    imageUrl: 'https://picsum.photos/seed/bag/300/400',
    initialX: 600,
    initialY: 60,
  },
]
