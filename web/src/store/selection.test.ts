import { beforeEach, describe, expect, it } from 'vitest';
import { useSelectionStore } from './selection';

beforeEach(() => {
  useSelectionStore.getState().clear();
});

describe('useSelectionStore', () => {
  it('starts empty', () => {
    const { ids, primaryId } = useSelectionStore.getState();
    expect(ids.size).toBe(0);
    expect(primaryId).toBeNull();
  });

  it('replace sets the singleton and primary', () => {
    useSelectionStore.getState().replace('a');
    expect([...useSelectionStore.getState().ids]).toEqual(['a']);
    expect(useSelectionStore.getState().primaryId).toBe('a');

    useSelectionStore.getState().replace('b');
    expect([...useSelectionStore.getState().ids]).toEqual(['b']);
    expect(useSelectionStore.getState().primaryId).toBe('b');
  });

  it('add inserts and sets primary; re-adding only updates primary', () => {
    const { add } = useSelectionStore.getState();
    add('a');
    add('b');
    expect([...useSelectionStore.getState().ids].sort()).toEqual(['a', 'b']);
    expect(useSelectionStore.getState().primaryId).toBe('b');
    add('a');
    expect(useSelectionStore.getState().ids.size).toBe(2);
    expect(useSelectionStore.getState().primaryId).toBe('a');
  });

  it('toggle adds, then removes, picking a new primary when the old was dropped', () => {
    const { toggle } = useSelectionStore.getState();
    toggle('a');
    toggle('b');
    expect(useSelectionStore.getState().primaryId).toBe('b');
    toggle('b');
    expect([...useSelectionStore.getState().ids]).toEqual(['a']);
    expect(useSelectionStore.getState().primaryId).toBe('a');
  });

  it('set replaces the whole set; honors primary hint when valid, falls back otherwise', () => {
    useSelectionStore.getState().set(['a', 'b', 'c'], 'b');
    expect(useSelectionStore.getState().primaryId).toBe('b');

    useSelectionStore.getState().set(['x', 'y'], 'nope');
    expect(useSelectionStore.getState().primaryId).toBe('x');

    useSelectionStore.getState().set([]);
    expect(useSelectionStore.getState().ids.size).toBe(0);
    expect(useSelectionStore.getState().primaryId).toBeNull();
  });

  it('mutations create new Set identity so subscribers re-render', () => {
    const before = useSelectionStore.getState().ids;
    useSelectionStore.getState().add('a');
    const after = useSelectionStore.getState().ids;
    expect(after).not.toBe(before);
  });

  it('has() reflects the current ids', () => {
    useSelectionStore.getState().add('a');
    expect(useSelectionStore.getState().has('a')).toBe(true);
    expect(useSelectionStore.getState().has('z')).toBe(false);
  });
});
