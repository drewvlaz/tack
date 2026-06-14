import { AnimatePresence } from 'framer-motion';
import { Moon, Share2, Sun, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useBoardItems } from '../hooks/server/useBoardItems';
import { useBoards } from '../hooks/server/useBoards';
import { useDeleteItem } from '../hooks/server/useDeleteItem';
import { useHotkey } from '../hooks/useHotkey';
import type { RealItem } from '../lib/trpc';
import { useBoardsStore } from '../store/boards';
import { useCanvasStore } from '../store/canvas';
import { useThemeStore } from '../store/theme';
import BoardsSidebar from './BoardsSidebar';
import MembersPanel from './BoardSettings/MembersPanel';
import ConfirmDialog from './shared/ConfirmDialog';
import SidePanel from './SidePanel/SidePanel';
import TrashDrawer from './TrashDrawer';

export default function AppUI() {
  const { selectedId, setSelectedId } = useCanvasStore();
  const { isDark, toggle } = useThemeStore();
  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const { items } = useBoardItems(activeBoardId);
  const selectedItem = activeBoardId
    ? (items.find(
        (i): i is RealItem => i.kind === 'real' && i.id === selectedId,
      ) ?? null)
    : null;

  const deleteItem = useDeleteItem(activeBoardId ?? '');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);

  const { boards } = useBoards();
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;
  const isOwner = activeBoard?.role === 'owner';

  useHotkey('Escape', () => setSelectedId(null), {
    scope: 'panel',
    enabled: selectedItem !== null,
  });

  useHotkey(['Delete', 'Backspace'], () => setConfirmDeleteOpen(true), {
    scope: 'panel',
    enabled: selectedItem !== null,
  });

  function handleConfirmDelete() {
    if (!selectedItem) {
      return;
    }
    deleteItem.mutate(selectedItem.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        setSelectedId(null);
      },
    });
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

      <AnimatePresence>
        {selectedItem && activeBoardId && (
          <SidePanel
            key={selectedItem.id}
            item={selectedItem}
            boardId={activeBoardId}
            onClose={() => setSelectedId(null)}
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
        title="Remove from board?"
        message={
          selectedItem?.title
            ? `“${selectedItem.title}” will be removed from this board.`
            : 'This item will be removed from this board.'
        }
        confirmLabel={deleteItem.isPending ? 'Removing…' : 'Remove'}
        destructive
        busy={deleteItem.isPending}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
