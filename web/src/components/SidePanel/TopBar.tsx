import { RotateCw, X } from 'lucide-react';
import { useBoardRole } from '../../hooks/server/useBoards';
import { useReparseItem } from '../../hooks/server/useReparseItem';
import { can, P } from '../../lib/permissions';

type TopBarProps = {
  id: string;
  boardId: string;
  onClose: () => void;
};

const buttonClass =
  'absolute top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised/90 text-fg-muted backdrop-blur-md ring-1 ring-border/60 hover:text-fg transition-colors disabled:opacity-50';

export default function TopBar({ id, boardId, onClose }: TopBarProps) {
  const reparseItem = useReparseItem(boardId);
  const canEdit = can(useBoardRole(boardId), P.BoardEdit);

  return (
    <>
      {canEdit && (
        <button
          onClick={() => reparseItem.mutate(id)}
          disabled={reparseItem.isPending}
          aria-label="Refresh from source"
          title="Re-fetch from source URL"
          className={`${buttonClass} right-16`}
        >
          <RotateCw
            size={12}
            strokeWidth={1.75}
            aria-hidden
            className={reparseItem.isPending ? 'animate-spin' : ''}
          />
        </button>
      )}

      <button
        onClick={onClose}
        aria-label="Close"
        className={`${buttonClass} right-4`}
      >
        <X size={13} strokeWidth={1.75} aria-hidden />
      </button>
    </>
  );
}
