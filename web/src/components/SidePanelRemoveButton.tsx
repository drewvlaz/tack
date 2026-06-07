import { useState } from 'react';
import { useDeleteItem } from '../hooks/useDeleteItem';
import ConfirmDialog from './ConfirmDialog';

type SidePanelRemoveButtonProps = {
  itemId: string;
  boardId: string;
  title: string | null;
  onRemoved: () => void;
};

export default function SidePanelRemoveButton({
  itemId,
  boardId,
  title,
  onRemoved,
}: SidePanelRemoveButtonProps) {
  const deleteItem = useDeleteItem(boardId);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleConfirm() {
    deleteItem.mutate(itemId, {
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
        className="text-xs text-fg-subtle hover:text-fg disabled:opacity-40 transition-colors"
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
