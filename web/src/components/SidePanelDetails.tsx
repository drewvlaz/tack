import { format, formatDistanceToNow } from 'date-fns';
import type { BoardItem } from '../lib/trpc';

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

type SidePanelDetailsProps = {
  item: BoardItem;
};

export default function SidePanelDetails({ item }: SidePanelDetailsProps) {
  const sourceHost = hostname(item.sourceUrl);
  const updatedAt = new Date(item.updatedAt * 1000);

  return (
    <div className="px-7 py-6">
      {item.brand && (
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-fg-subtle">
          {item.brand}
        </p>
      )}
      {item.title && (
        <h2 className="mt-1.5 text-xl font-medium leading-snug text-fg">
          {item.title}
        </h2>
      )}
      {item.price !== null && (
        <p className="mt-3 text-base text-fg tabular-nums">
          ${item.price.toFixed(2)}
          <span className="ml-1.5 text-xs text-fg-subtle">{item.currency}</span>
        </p>
      )}

      {item.description && (
        <>
          <div className="my-6 h-px bg-border" />
          <p className="text-[13.5px] leading-relaxed text-fg-muted whitespace-pre-line">
            {item.description}
          </p>
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">
        <span title={format(updatedAt, 'PPpp')}>
          Refreshed {formatDistanceToNow(updatedAt, { addSuffix: true })}
        </span>
        {sourceHost && (
          <>
            <span aria-hidden="true">·</span>
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-fg-muted hover:text-fg transition-colors"
            >
              <span>View on {sourceHost}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M3 7l4-4M3.5 3h3.5v3.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </>
        )}
      </div>
    </div>
  );
}
