import { useReparseItem } from '../hooks/useReparseItem';

type SidePanelTopBarProps = {
  itemId: string;
  boardId: string;
  onClose: () => void;
};

const buttonClass =
  'absolute top-4 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-surface-raised/90 text-fg-muted backdrop-blur-md ring-1 ring-border/60 hover:text-fg transition-colors disabled:opacity-50';

export default function SidePanelTopBar({
  itemId,
  boardId,
  onClose,
}: SidePanelTopBarProps) {
  const reparseItem = useReparseItem(boardId);

  return (
    <>
      <button
        onClick={() => reparseItem.mutate(itemId)}
        disabled={reparseItem.isPending}
        aria-label="Refresh from source"
        title="Re-fetch from source URL"
        className={`${buttonClass} right-16`}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={reparseItem.isPending ? 'animate-spin' : ''}
        >
          <path
            d="M10 4.5a4 4 0 1 0 .5 3"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M7.5 4.5H10V2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <button
        onClick={onClose}
        aria-label="Close"
        className={`${buttonClass} right-4`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 2.5l7 7M9.5 2.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </>
  );
}
