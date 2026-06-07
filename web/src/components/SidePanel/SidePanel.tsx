import { spring } from '../../config';
import { resolveImageUrl } from '../../lib/api';
import type { BoardItem } from '../../lib/trpc';
import { useRailsStore } from '../../store/rails';
import Rail from '../shared/Rail';
import Details from './Details';
import Hero from './Hero';
import RemoveButton from './RemoveButton';
import TopBar from './TopBar';

type SidePanelProps = {
  item: BoardItem;
  boardId: string;
  onClose: () => void;
};

export default function SidePanel({ item, boardId, onClose }: SidePanelProps) {
  const rightWidth = useRailsStore((s) => s.rightWidth);
  const setRightWidth = useRailsStore((s) => s.setRightWidth);
  const images = item.images
    .map((img) => {
      const url = resolveImageUrl(img.url);
      return url ? { id: img.id, url } : null;
    })
    .filter((x): x is { id: string; url: string } => x !== null);

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
      <TopBar itemId={item.itemId} boardId={boardId} onClose={onClose} />

      <div className="flex-1 overflow-y-auto">
        <Hero
          images={images}
          alt={item.title ?? ''}
          itemId={item.itemId}
          boardId={boardId}
        />
        <Details item={item} />
        <div className="border-border border-t px-7 py-4">
          <RemoveButton
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
