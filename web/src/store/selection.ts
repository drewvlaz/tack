import { create } from 'zustand';

// Selection is its own concern. The store NEVER mutates `ids` in place —
// every mutation creates a new Set so Zustand subscribers re-render
// (identity-equality is how Zustand decides whether to notify). Same
// rule applies to anyone composing this store externally.
//
// `primaryId` is the SidePanel's focus item; always either in `ids` or null.
// Keeping it explicit avoids per-read derivation; it's set deliberately by
// each operation (toggle/add/replace/set).
//
// Empty Set sentinel — shared across "no selection" reads so consumers can
// snapshot the value without churning identity needlessly.
const EMPTY_IDS: ReadonlySet<string> = new Set();

type SelectionStore = {
  ids: ReadonlySet<string>;
  primaryId: string | null;
  has: (id: string) => boolean;
  replace: (id: string) => void;
  toggle: (id: string) => void;
  add: (id: string) => void;
  remove: (id: string) => void;
  set: (ids: Iterable<string>, primary?: string | null) => void;
  union: (ids: Iterable<string>) => void;
  subtract: (ids: Iterable<string>) => void;
  clear: () => void;
};

function pickFallbackPrimary(ids: ReadonlySet<string>): string | null {
  if (ids.size === 0) {
    return null;
  }
  // Iteration order on Set is insertion order; the most-recently-added id
  // bubbles up here only if callers care, otherwise first-inserted wins.
  // Either way is deterministic.
  for (const id of ids) {
    return id;
  }
  return null;
}

export const useSelectionStore = create<SelectionStore>((setState, get) => ({
  ids: EMPTY_IDS,
  primaryId: null,

  has: (id) => get().ids.has(id),

  replace: (id) =>
    setState({ ids: new Set([id]), primaryId: id }),

  toggle: (id) => {
    const { ids, primaryId } = get();
    const next = new Set(ids);
    if (next.has(id)) {
      next.delete(id);
      const nextPrimary =
        primaryId === id ? pickFallbackPrimary(next) : primaryId;
      setState({ ids: next, primaryId: nextPrimary });
    } else {
      next.add(id);
      setState({ ids: next, primaryId: id });
    }
  },

  add: (id) => {
    const { ids } = get();
    if (ids.has(id)) {
      setState({ primaryId: id });
      return;
    }
    const next = new Set(ids);
    next.add(id);
    setState({ ids: next, primaryId: id });
  },

  remove: (id) => {
    const { ids, primaryId } = get();
    if (!ids.has(id)) {
      return;
    }
    const next = new Set(ids);
    next.delete(id);
    const nextPrimary =
      primaryId === id ? pickFallbackPrimary(next) : primaryId;
    setState({ ids: next, primaryId: nextPrimary });
  },

  set: (input, primary) => {
    const next = new Set(input);
    if (next.size === 0) {
      setState({ ids: EMPTY_IDS, primaryId: null });
      return;
    }
    const nextPrimary =
      primary !== undefined
        ? primary !== null && next.has(primary)
          ? primary
          : pickFallbackPrimary(next)
        : pickFallbackPrimary(next);
    setState({ ids: next, primaryId: nextPrimary });
  },

  union: (input) => {
    const { ids, primaryId } = get();
    const next = new Set(ids);
    for (const id of input) {
      next.add(id);
    }
    if (next.size === ids.size) {
      return;
    }
    setState({
      ids: next,
      primaryId: primaryId ?? pickFallbackPrimary(next),
    });
  },

  subtract: (input) => {
    const { ids, primaryId } = get();
    const toRemove = new Set(input);
    if (toRemove.size === 0) {
      return;
    }
    let changed = false;
    const next = new Set<string>();
    for (const id of ids) {
      if (toRemove.has(id)) {
        changed = true;
      } else {
        next.add(id);
      }
    }
    if (!changed) {
      return;
    }
    if (next.size === 0) {
      setState({ ids: EMPTY_IDS, primaryId: null });
      return;
    }
    const nextPrimary =
      primaryId !== null && next.has(primaryId)
        ? primaryId
        : pickFallbackPrimary(next);
    setState({ ids: next, primaryId: nextPrimary });
  },

  clear: () => setState({ ids: EMPTY_IDS, primaryId: null }),
}));
