import { useState } from 'react';
import { useDeleteItems } from '../../hooks/server/useDeleteItems';
import ConfirmDialog from '../shared/ConfirmDialog';

type RemoveButtonProps = {
  id: string;
  boardId: string;
  title: string | null;
  onRemoved: () => void;
};

export default function RemoveButton({
  id,
  boardId,
  title,
  onRemoved,
}: RemoveButtonProps) {
  const deleteItem = useDeleteItems(boardId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleConfirm() {
    deleteItem.mutate([id], {
      onSuccess: () => {
        setConfirmOpen(false);
        onRemoved();
      },
    });
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={deleteItem.isPending}
        className="text-fg-subtle hover:text-fg text-xs transition-colors disabled:opacity-40"
      >
        {deleteItem.isPending ? 'Removing…' : 'Remove from board'}
      </button>

      <ConfirmDialog
        open={confirmOpen}
        title="Remove from board?"
        message={
          title
            ? `“${title}” will be removed from this board.`
            : 'This item will be removed from this board.'
        }
        confirmLabel={deleteItem.isPending ? 'Removing…' : 'Remove'}
        destructive
        busy={deleteItem.isPending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </>
  );
}
