import { AnimatePresence } from 'framer-motion';
import BoardsSidebar from './BoardsSidebar';
import SidePanel from './SidePanel';
import { useCanvasStore } from '../store/canvas';
import { useThemeStore } from '../store/theme';
import { useBoardItems } from '../hooks/useBoardItems';
import { useBoardsStore } from '../store/boards';

export default function AppUI() {
  const { selectedId, setSelectedId } = useCanvasStore();
  const { isDark, toggle } = useThemeStore();
  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const { items } = useBoardItems(activeBoardId ?? '');
  const selectedItem = activeBoardId
    ? (items.find((i) => i.id === selectedId) ?? null)
    : null;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <BoardsSidebar />

      <button
        onClick={toggle}
        aria-label="Toggle dark mode"
        className="pointer-events-auto absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised shadow-md ring-1 ring-border text-fg-muted hover:text-fg transition-colors"
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
    </div>
  );
}
