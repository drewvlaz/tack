import { AnimatePresence } from 'framer-motion';
import SidePanel from './SidePanel';
import { useCanvasStore } from '../store/canvas';
import { useBoardItems } from '../hooks/useBoardItems';
import { CANVAS_BOARD_ID } from './Canvas';

export default function AppUI() {
  const { selectedId, setSelectedId } = useCanvasStore();
  const { items } = useBoardItems(CANVAS_BOARD_ID);
  const selectedItem = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none">
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
