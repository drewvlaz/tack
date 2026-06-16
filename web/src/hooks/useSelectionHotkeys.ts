import { useSelectionStore } from '../store/selection';
import { useHotkey } from './useHotkey';

// Keyboard shortcuts that operate on the current selection. Escape and
// Delete/Backspace are scoped to the panel so they don't fight typing in
// inputs; Cmd/Ctrl+A is global with preventDefault so it doesn't trigger
// the browser's "select all text". Delete is intentionally a request — the
// caller owns the confirm dialog and the mutation.
//
// `canEdit` gates the mutating hotkeys (Delete/Backspace). Escape and
// Cmd/Ctrl+A are non-mutating — they manage selection state only — and
// stay enabled regardless of role.
type Args = {
  // Live count drives the enabled gate. Reading from the store inside the
  // hook would also work but would re-render the caller every selection
  // change just to re-evaluate enabled — let the caller pass it in.
  selectionCount: number;
  activeBoardId: string | null;
  // All real (non-skeleton) item ids on the active board, in order. The last
  // becomes primaryId on Cmd+A.
  realItemIds: ReadonlyArray<string>;
  canEdit: boolean;
  onDeleteRequest: () => void;
};

export function useSelectionHotkeys({
  selectionCount,
  activeBoardId,
  realItemIds,
  canEdit,
  onDeleteRequest,
}: Args) {
  useHotkey('Escape', () => useSelectionStore.getState().clear(), {
    scope: 'panel',
    enabled: selectionCount > 0,
  });

  useHotkey(['Delete', 'Backspace'], onDeleteRequest, {
    scope: 'panel',
    enabled: selectionCount > 0 && canEdit,
  });

  useHotkey(
    'mod+a',
    () => {
      if (realItemIds.length === 0) {
        return;
      }
      useSelectionStore
        .getState()
        .set(realItemIds, realItemIds[realItemIds.length - 1]);
    },
    {
      scope: 'global',
      enabled: !!activeBoardId && realItemIds.length > 0,
      preventDefault: true,
    },
  );
}
