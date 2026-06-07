import { AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useBoardItems } from '../hooks/server/useBoardItems';
import { useDeleteItem } from '../hooks/server/useDeleteItem';
import { useHotkey } from '../hooks/useHotkey';
import type { RealItem } from '../lib/trpc';
import { useBoardsStore } from '../store/boards';
import { useCanvasStore } from '../store/canvas';
import { useThemeStore } from '../store/theme';
import BoardsSidebar from './BoardsSidebar';
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

  useHotkey('Escape', () => setSelectedId(null), {
    scope: 'panel',
    enabled: selectedItem !== null,
  });

  useHotkey(['Delete', 'Backspace'], () => setConfirmDeleteOpen(true), {
    scope: 'panel',
    enabled: selectedItem !== null,
  });

  function handleConfirmDelete() {
    if (!selectedItem) return;
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
        {activeBoardId && (
          <button
            onClick={() => setTrashOpen(true)}
            aria-label="Open trash"
            title="Trash"
            className="bg-surface-raised ring-border text-fg-muted hover:text-fg flex h-8 w-8 items-center justify-center rounded-full shadow-md ring-1 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path
                d="M2.5 4h9M5.5 4V2.8a.8.8 0 0 1 .8-.8h1.4a.8.8 0 0 1 .8.8V4M3.7 4l.6 7a1 1 0 0 0 1 .9h3.4a1 1 0 0 0 1-.9l.6-7"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <button
          onClick={toggle}
          aria-label="Toggle dark mode"
          className="bg-surface-raised ring-border text-fg-muted hover:text-fg flex h-8 w-8 items-center justify-center rounded-full shadow-md ring-1 transition-colors"
        >
          {isDark ? '☀︎' : '☽'}
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
