import { motion } from 'framer-motion';
import { panel, spring } from '../config';
import { type BoardItem } from '../api/types';
import { useDeleteItem } from '../hooks/useDeleteItem';

type SidePanelProps = {
  item: BoardItem;
  boardId: string;
  onClose: () => void;
};

export default function SidePanel({ item, boardId, onClose }: SidePanelProps) {
  const deleteItem = useDeleteItem(boardId);

  function handleDelete() {
    deleteItem.mutate(item.id, { onSuccess: onClose });
  }

  return (
    <motion.aside
      className="absolute right-0 top-0 z-20 pointer-events-auto h-full overflow-y-auto bg-white shadow-2xl"
      style={{ width: panel.width }}
      initial={{ x: panel.width }}
      animate={{ x: 0 }}
      exit={{ x: panel.width }}
      transition={spring.panel}
    >
      <div className="relative">
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt={item.title ?? ''}
            className="w-full object-cover"
            style={{ height: 420 }}
          />
        )}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-neutral-600 backdrop-blur-sm hover:bg-white"
        >
          ✕
        </button>
      </div>

      <div className="p-6">
        {item.title && <h2 className="text-lg font-semibold text-neutral-900">{item.title}</h2>}
        {item.price !== null && (
          <p className="mt-1 text-base text-neutral-500">
            {item.currency} {item.price.toFixed(2)}
          </p>
        )}
        {item.imageUrl && (
          <a
            href={item.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block text-sm text-blue-500 hover:underline truncate"
          >
            View source
          </a>
        )}

        <button
          onClick={handleDelete}
          disabled={deleteItem.isPending}
          className="mt-8 w-full rounded-xl border border-red-200 py-2 text-sm text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
        >
          {deleteItem.isPending ? 'Removing…' : 'Remove from board'}
        </button>
      </div>
    </motion.aside>
  );
}
