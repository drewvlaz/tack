import { format, formatDistanceToNow } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { BoardItem } from '../../lib/trpc';

function hostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function formatPrice(amount: number, currency: string): string {
  // Intl handles symbol + locale formatting (so EUR becomes €, GBP becomes £,
  // JPY drops decimals, etc). Pinning to en-US for consistent grouping while
  // still surfacing the right symbol.
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    // Unknown currency code → fall back to a plain decimal + ISO suffix.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

type DetailsProps = {
  item: BoardItem;
};

// If the item was reparsed at least a minute after being added, surface that
// instead — otherwise the added/refreshed timestamps are effectively the same.
const REFRESH_THRESHOLD_SEC = 60;

export default function Details({ item }: DetailsProps) {
  const sourceHost = hostname(item.sourceUrl);
  const wasRefreshed = item.updatedAt - item.addedAt > REFRESH_THRESHOLD_SEC;
  const stampLabel = wasRefreshed ? 'Refreshed' : 'Added';
  const stamp = new Date((wasRefreshed ? item.updatedAt : item.addedAt) * 1000);
  const hasDetails = item.details.length > 0;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-7 py-6">
      {item.brand && (
        <p className="text-fg-subtle text-[10px] font-medium tracking-[0.14em] uppercase">
          {item.brand}
        </p>
      )}
      {item.title && (
        <h2 className="text-fg mt-1.5 text-xl leading-snug font-medium">
          {item.title}
        </h2>
      )}
      {item.price !== null && (
        <p className="text-fg mt-3 text-base tabular-nums">
          {formatPrice(item.price, item.currency)}
        </p>
      )}

      {item.description && (
        <>
          <div className="bg-border my-6 h-px" />
          <p className="text-fg-muted text-[13.5px] leading-relaxed whitespace-pre-line">
            {item.description}
          </p>
        </>
      )}

      {hasDetails && (
        <>
          <div className="bg-border my-6 h-px" />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="text-fg-muted hover:text-fg flex w-full items-center justify-between text-[11px] font-medium tracking-[0.14em] uppercase transition-colors"
          >
            <span>Details</span>
            <motion.span
              className="inline-flex"
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            >
              <ChevronDown size={11} strokeWidth={1.75} aria-hidden />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.dl
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 32 }}
                className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 overflow-hidden pt-4 text-[13px]"
              >
                {item.details.map((d, i) => (
                  <div key={`${d.label}-${i}`} className="contents">
                    <dt className="text-fg-subtle whitespace-nowrap">
                      {d.label}
                    </dt>
                    <dd className="text-fg-muted leading-relaxed">{d.value}</dd>
                  </div>
                ))}
              </motion.dl>
            )}
          </AnimatePresence>
        </>
      )}

      <div className="text-fg-subtle mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span title={format(stamp, 'PPpp')}>
          {stampLabel} {formatDistanceToNow(stamp, { addSuffix: true })}
        </span>
        {sourceHost && (
          <>
            <span aria-hidden="true">·</span>
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg-muted hover:text-fg inline-flex items-center gap-1.5 transition-colors"
            >
              <span>View on {sourceHost}</span>
              <ArrowUpRight size={11} strokeWidth={1.75} aria-hidden />
            </a>
          </>
        )}
      </div>
    </div>
  );
}
