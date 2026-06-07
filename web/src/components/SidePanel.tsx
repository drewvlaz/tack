import { spring } from '../config';
import { resolveImageUrl } from '../lib/api';
import type { BoardItem } from '../lib/trpc';
import { useRailsStore } from '../store/rails';
import Rail from './Rail';
import SidePanelDetails from './SidePanelDetails';
import SidePanelHero from './SidePanelHero';
import SidePanelRemoveButton from './SidePanelRemoveButton';
import SidePanelTopBar from './SidePanelTopBar';

type SidePanelProps = {
  item: BoardItem;
  boardId: string;
  onClose: () => void;
};

export default function SidePanel({ item, boardId, onClose }: SidePanelProps) {
  const rightWidth = useRailsStore((s) => s.rightWidth);
  const setRightWidth = useRailsStore((s) => s.setRightWidth);
  const imageUrls = item.imageUrls
    .map((u) => resolveImageUrl(u))
    .filter((u): u is string => u !== null);

  return (
    <Rail
      side="right"
      width={rightWidth}
      onResize={setRightWidth}
      initial={{ x: rightWidth }}
      animate={{ x: 0 }}
      exit={{ x: rightWidth }}
      transition={spring.panel}
    >
      <SidePanelTopBar itemId={item.itemId} boardId={boardId} onClose={onClose} />

      <div className="flex-1 overflow-y-auto">
        <SidePanelHero imageUrls={imageUrls} alt={item.title ?? ''} />
        <SidePanelDetails item={item} />
        <div className="border-t border-border px-7 py-4">
          <SidePanelRemoveButton
            itemId={item.id}
            boardId={boardId}
            title={item.title}
            onRemoved={onClose}
          />
        </div>
      </div>
    </Rail>
  );
}
