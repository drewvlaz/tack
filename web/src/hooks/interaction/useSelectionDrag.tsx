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
import { usePatchPositions } from '../server/usePatchPositions';
import { useSelectionStore } from '../../store/selection';

// Each Card registers its motion values here so the coordinator can drive
// them in lockstep during a group drag. The registry lives in a ref so
// register/unregister doesn't churn React state.
export type CardMVHandles = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  springX: MotionValue<number>;
  springY: MotionValue<number>;
};

type SelectionDragApi = {
  register: (id: string, handles: CardMVHandles) => () => void;
  driveDelta: (originId: string, dx: number, dy: number) => void;
  commit: () => void;
};

const SelectionDragContext = createContext<SelectionDragApi | null>(null);

export function SelectionDragProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, CardMVHandles>());
  const patchPositions = usePatchPositions();

  const register = useCallback(
    (id: string, handles: CardMVHandles) => {
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
    patchPositions.mutate(patches);
  }, [patchPositions]);

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

// Card-side hook: registers this card's motion values with the coordinator
// for the lifetime of the component. Returns nothing — the registration is
// the side effect.
export function useRegisterCardMVs(
  id: string | null,
  handles: CardMVHandles,
): void {
  const api = useContext(SelectionDragContext);
  useEffect(() => {
    if (!api || !id) {
      return;
    }
    return api.register(id, handles);
  }, [api, id, handles]);
}
