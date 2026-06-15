import { AnimatePresence } from 'framer-motion';
import { Moon, Share2, Sun, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useBoardItems } from '../hooks/server/useBoardItems';
import { useBoards } from '../hooks/server/useBoards';
import { useDeleteItem } from '../hooks/server/useDeleteItem';
import { useDeleteItems } from '../hooks/server/useDeleteItems';
import { useHotkey } from '../hooks/useHotkey';
import type { RealItem } from '../lib/trpc';
import { useBoardsStore } from '../store/boards';
import { useThemeStore } from '../store/theme';
import { useSelectionStore } from '../store/selection';
import BoardsSidebar from './BoardsSidebar';
import MembersPanel from './BoardSettings/MembersPanel';
import ConfirmDialog from './shared/ConfirmDialog';
import SidePanel from './SidePanel/SidePanel';
import TrashDrawer from './TrashDrawer';

export default function AppUI() {
  const selectionIds = useSelectionStore((s) => s.ids);
  const primaryId = useSelectionStore((s) => s.primaryId);
  const { isDark, toggle } = useThemeStore();
  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const { items } = useBoardItems(activeBoardId);
  const realItems = useMemo(
    () => items.filter((i): i is RealItem => i.kind === 'real'),
    [items],
  );
  const primaryItem = activeBoardId && primaryId
    ? realItems.find((i) => i.id === primaryId) ?? null
    : null;

  const deleteItem = useDeleteItem(activeBoardId ?? '');
  const deleteItems = useDeleteItems(activeBoardId ?? '');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const { boards } = useBoards();
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;
  const isOwner = activeBoard?.role === 'owner';

  const selectionCount = selectionIds.size;
  const isMulti = selectionCount > 1;
  const isPending = deleteItems.isPending || deleteItem.isPending;

  useHotkey('Escape', () => useSelectionStore.getState().clear(), {
    scope: 'panel',
    enabled: selectionCount > 0,
  });

  useHotkey(['Delete', 'Backspace'], () => setConfirmDeleteOpen(true), {
    scope: 'panel',
    enabled: selectionCount > 0,
  });

  useHotkey(
    'mod+a',
    () => {
      if (realItems.length === 0) {
        return;
      }
      useSelectionStore
        .getState()
        .set(realItems.map((i) => i.id), realItems[realItems.length - 1].id);
    },
    {
      scope: 'global',
      enabled: !!activeBoardId && realItems.length > 0,
      preventDefault: true,
    },
  );

  function handleConfirmDelete() {
    if (selectionCount === 0) {
      return;
    }
    const ids = [...selectionIds];
    if (ids.length === 1) {
      deleteItem.mutate(ids[0], {
        onSuccess: () => {
          setConfirmDeleteOpen(false);
          useSelectionStore.getState().clear();
        },
      });
    } else {
      deleteItems.mutate(ids, {
        onSuccess: () => {
          setConfirmDeleteOpen(false);
          useSelectionStore.getState().clear();
        },
      });
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <BoardsSidebar />

      <div className="pointer-events-auto absolute top-4 right-4 flex gap-2">
        {activeBoardId && isOwner && (
          <button
            onClick={() => setMembersOpen(true)}
            aria-label="Share board"
            title="Share"
            className="bg-surface-raised ring-border text-fg-muted hover:text-fg flex h-8 w-8 items-center justify-center rounded-full shadow-md ring-1 transition-colors"
          >
            <Share2 size={13} strokeWidth={1.6} aria-hidden />
          </button>
        )}
        {activeBoardId && (
          <button
            onClick={() => setTrashOpen(true)}
            aria-label="Open trash"
            title="Trash"
            className="bg-surface-raised ring-border text-fg-muted hover:text-fg flex h-8 w-8 items-center justify-center rounded-full shadow-md ring-1 transition-colors"
          >
            <Trash2 size={13} strokeWidth={1.6} aria-hidden />
          </button>
        )}
        <button
          onClick={toggle}
          aria-label="Toggle dark mode"
          className="bg-surface-raised ring-border text-fg-muted hover:text-fg flex h-8 w-8 items-center justify-center rounded-full shadow-md ring-1 transition-colors"
        >
          {isDark ? (
            <Sun size={14} strokeWidth={1.6} aria-hidden />
          ) : (
            <Moon size={14} strokeWidth={1.6} aria-hidden />
          )}
        </button>
      </div>

      {isMulti && (
        <div
          className="bg-surface-raised ring-border text-fg pointer-events-auto absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-md ring-1"
          role="status"
        >
          {selectionCount} selected
        </div>
      )}

      {/* aria-live region — announces selection count changes. Polite, so a
          screen reader finishes the current utterance before reading. */}
      <div className="sr-only" role="status" aria-live="polite">
        {selectionCount === 0
          ? ''
          : selectionCount === 1
            ? '1 item selected'
            : `${selectionCount} items selected`}
      </div>

      <AnimatePresence>
        {primaryItem && activeBoardId && (
          <SidePanel
            key={primaryItem.id}
            item={primaryItem}
            boardId={activeBoardId}
            onClose={() => useSelectionStore.getState().clear()}
          />
        )}
      </AnimatePresence>

      {activeBoardId && (
        <TrashDrawer
          open={trashOpen}
          boardId={activeBoardId}
          onClose={() => setTrashOpen(false)}
        />
      )}

      {activeBoardId && activeBoard && isOwner && (
        <MembersPanel
          open={membersOpen}
          boardId={activeBoardId}
          boardName={activeBoard.name}
          onClose={() => setMembersOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={isMulti ? 'Remove items from board?' : 'Remove from board?'}
        message={
          isMulti
            ? `${selectionCount} items will be removed from this board.`
            : primaryItem?.title
              ? `“${primaryItem.title}” will be removed from this board.`
              : 'This item will be removed from this board.'
        }
        confirmLabel={isPending ? 'Removing…' : 'Remove'}
        destructive
        busy={isPending}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
