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

      <button
        onClick={toggle}
        aria-label="Toggle dark mode"
        className="bg-surface-raised ring-border text-fg-muted hover:text-fg pointer-events-auto absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full shadow-md ring-1 transition-colors"
      >
        {isDark ? '☀︎' : '☽'}
      </button>

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
