import { AnimatePresence } from 'framer-motion';
import SidePanel from './SidePanel';
import { useCanvasStore } from '../store/canvas';
import { useThemeStore } from '../store/theme';
import { useBoardItems } from '../hooks/useBoardItems';
import { CANVAS_BOARD_ID } from './Canvas';

export default function AppUI() {
  const { selectedId, setSelectedId } = useCanvasStore();
  const { isDark, toggle } = useThemeStore();
  const { items } = useBoardItems(CANVAS_BOARD_ID);
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
      <button
        onClick={toggle}
        aria-label="Toggle dark mode"
        className="pointer-events-auto absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised shadow-md ring-1 ring-border text-fg-muted hover:text-fg transition-colors"
      >
        {isDark ? '☀︎' : '☽'}
      </button>

      <AnimatePresence>
        {selectedItem && (
          <SidePanel
            key={selectedItem.id}
            item={selectedItem}
            boardId={CANVAS_BOARD_ID}
            onClose={() => setSelectedId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
