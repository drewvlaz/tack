import { beforeEach, describe, expect, it } from 'vitest';
import { useCanvasStore } from './canvas';

beforeEach(() => {
  useCanvasStore.setState({ zIndices: {} });
});

describe('useCanvasStore.bringToFront', () => {
  it('returns null when the id is not in the items list', () => {
    const result = useCanvasStore.getState().bringToFront('missing', [
      { id: 'a', zIndex: 1 },
      { id: 'b', zIndex: 2 },
    ]);
    expect(result).toBeNull();
    expect(useCanvasStore.getState().zIndices).toEqual({});
  });

  it('advances z above the current max and records it in zIndices', () => {
    const items = [
      { id: 'a', zIndex: 1 },
      { id: 'b', zIndex: 5 },
      { id: 'c', zIndex: 3 },
    ];
    const result = useCanvasStore.getState().bringToFront('a', items);
    expect(result).toBe(6);
    expect(useCanvasStore.getState().zIndices).toEqual({ a: 6 });
  });

  it('no-ops and returns null when the id is already strictly on top', () => {
    const items = [
      { id: 'a', zIndex: 10 },
      { id: 'b', zIndex: 2 },
    ];
    const result = useCanvasStore.getState().bringToFront('a', items);
    expect(result).toBeNull();
    expect(useCanvasStore.getState().zIndices).toEqual({});
  });

  it('bumps when tied with the next-highest z (current z is not strictly above)', () => {
    const items = [
      { id: 'a', zIndex: 5 },
      { id: 'b', zIndex: 5 },
    ];
    const result = useCanvasStore.getState().bringToFront('a', items);
    expect(result).toBe(6);
    expect(useCanvasStore.getState().zIndices.a).toBe(6);
  });

  it('prefers the override in zIndices over the items array z', () => {
    useCanvasStore.setState({ zIndices: { a: 99 } });
    const items = [
      { id: 'a', zIndex: 1 },
      { id: 'b', zIndex: 50 },
    ];
    const result = useCanvasStore.getState().bringToFront('a', items);
    // a's effective z is 99 (override), already above b's 50 → no bump.
    expect(result).toBeNull();
    expect(useCanvasStore.getState().zIndices).toEqual({ a: 99 });
  });

  it('preserves other overrides when bumping one item', () => {
    useCanvasStore.setState({ zIndices: { a: 4, c: 7 } });
    const items = [
      { id: 'a', zIndex: 1 },
      { id: 'b', zIndex: 2 },
      { id: 'c', zIndex: 3 },
    ];
    const result = useCanvasStore.getState().bringToFront('b', items);
    expect(result).toBe(8);
    expect(useCanvasStore.getState().zIndices).toEqual({ a: 4, c: 7, b: 8 });
  });
});
