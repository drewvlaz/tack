import { spring } from '../../config';
import { useBoardRole } from '../../hooks/server/useBoards';
import { resolveImageUrl } from '../../lib/api';
import { can, P } from '../../lib/permissions';
import type { BoardItem } from '../../lib/trpc';
import { useRailsStore } from '../../store/rails';
import Rail from '../shared/Rail';
import Details from './Details';
import Hero from './Hero';
import RemoveButton from './RemoveButton';
import TopBar from './TopBar';

// SidePanel currently surfaces product metadata only. Text items get their
// own detail UI in a later card; callers must narrow before passing.
type ProductBoardItem = Extract<BoardItem, { kind: 'product' }>;

type SidePanelProps = {
  item: ProductBoardItem;
  boardId: string;
  onClose: () => void;
};

export default function SidePanel({ item, boardId, onClose }: SidePanelProps) {
  const rightWidth = useRailsStore((s) => s.rightWidth);
  const setRightWidth = useRailsStore((s) => s.setRightWidth);
  const canEdit = can(useBoardRole(boardId), P.BoardEdit);
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
      <TopBar id={item.id} boardId={boardId} onClose={onClose} />

      <div className="flex-1 overflow-y-auto">
        <Hero
          images={images}
          alt={item.title ?? ''}
          id={item.id}
          boardId={boardId}
        />
        <Details item={item} />
        {canEdit && (
          <div className="border-border border-t px-7 py-4">
            <RemoveButton
              id={item.id}
              boardId={boardId}
              title={item.title}
              onRemoved={onClose}
            />
          </div>
        )}
      </div>
    </Rail>
  );
}
