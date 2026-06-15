/* eslint-disable react-refresh/only-export-components */
import { type MotionValue } from 'framer-motion';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { usePatchItems } from '../server/usePatchItems';
import { useSelectionStore } from '../../store/selection';

// Drag targets register their position MVs here so the coordinator can drive
// them in lockstep during a group drag. The registry lives in a ref so
// register/unregister doesn't churn React state. Targets are addressed by an
// opaque id — the coordinator doesn't care what they represent, only that the
// selection store keys them.
export type DragTargetHandles = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  springX: MotionValue<number>;
  springY: MotionValue<number>;
};

type SelectionDragApi = {
  register: (id: string, handles: DragTargetHandles) => () => void;
  driveDelta: (originId: string, dx: number, dy: number) => void;
  commit: () => void;
};

const SelectionDragContext = createContext<SelectionDragApi | null>(null);

export function SelectionDragProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, DragTargetHandles>());
  const patchItems = usePatchItems();

  const register = useCallback(
    (id: string, handles: DragTargetHandles) => {
      registry.current.set(id, handles);
      return () => {
        registry.current.delete(id);
      };
    },
    [],
  );

  const driveDelta = useCallback(
    (originId: string, dx: number, dy: number) => {
      const ids = useSelectionStore.getState().ids;
      for (const id of ids) {
        if (id === originId) {
          // The originating card's own gesture handler moves it.
          continue;
        }
        const handles = registry.current.get(id);
        if (!handles) {
          continue;
        }
        const nx = handles.x.get() + dx;
        const ny = handles.y.get() + dy;
        handles.x.set(nx);
        handles.y.set(ny);
        handles.springX.jump(nx);
        handles.springY.jump(ny);
      }
    },
    [],
  );

  const commit = useCallback(() => {
    const ids = useSelectionStore.getState().ids;
    if (ids.size === 0) {
      return;
    }
    const patches: Array<{
      id: string;
      patch: { x: number; y: number };
    }> = [];
    for (const id of ids) {
      const handles = registry.current.get(id);
      if (!handles) {
        continue;
      }
      patches.push({
        id,
        patch: { x: handles.x.get(), y: handles.y.get() },
      });
    }
    if (patches.length === 0) {
      return;
    }
    patchItems.mutate(patches);
  }, [patchItems]);

  const api = useMemo<SelectionDragApi>(
    () => ({ register, driveDelta, commit }),
    [register, driveDelta, commit],
  );

  return (
    <SelectionDragContext.Provider value={api}>
      {children}
    </SelectionDragContext.Provider>
  );
}

export function useSelectionDrag(): SelectionDragApi {
  const ctx = useContext(SelectionDragContext);
  if (!ctx) {
    throw new Error(
      'useSelectionDrag must be used inside <SelectionDragProvider>',
    );
  }
  return ctx;
}

// Target-side hook: publishes this target's position MVs to the group-drag
// coordinator for the lifetime of the component. Pass `id = null` to opt out
// (e.g. skeleton cards with no persistent id). Returns nothing — the
// registration is the side effect.
export function useRegisterDragTarget(
  id: string | null,
  handles: DragTargetHandles,
): void {
  const api = useContext(SelectionDragContext);
  useEffect(() => {
    if (!api || !id) {
      return;
    }
    return api.register(id, handles);
  }, [api, id, handles]);
}
