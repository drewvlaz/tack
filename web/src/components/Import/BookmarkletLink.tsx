import { useMemo, useState } from 'react';
import { buildBookmarklet } from '../../lib/bookmarklet';

// Draggable "Save to Tack" link that the user drops onto their bookmark bar.
// React strips `javascript:` from `href` for security reasons unless we
// route around it (the `href` is set imperatively via a ref, or we accept
// the warning by binding through a callback ref). We use the dangerously-
// honest path: set the attribute after mount via a ref callback.
//
// The bookmarklet code is generated from `window.location.origin` so the
// drop-zone always returns to whatever deployment the user grabbed it from.

export default function BookmarkletLink() {
  const [copied, setCopied] = useState(false);
  const href = useMemo(
    () => buildBookmarklet(window.location.origin),
    [],
  );

  function copyToClipboard() {
    void navigator.clipboard.writeText(href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="text-fg-muted flex flex-col gap-1.5 text-[11px] leading-snug">
      <p>
        Site blocks the worker? Drag this to your bookmark bar, then click it
        on the product page:
      </p>
      <div className="flex items-center gap-2">
        <a
          ref={(node) => {
            // React strips javascript: hrefs in JSX; set imperatively.
            if (node) {
              node.setAttribute('href', href);
            }
          }}
          draggable
          onClick={(e) => e.preventDefault()}
          className="bg-fg text-surface ring-fg/20 inline-flex h-7 cursor-grab items-center rounded-md px-3 text-xs font-medium ring-1 select-none active:cursor-grabbing"
        >
          Save to Tack
        </a>
        <button
          type="button"
          onClick={copyToClipboard}
          className="text-fg-subtle hover:text-fg text-[11px] underline-offset-2 outline-none focus-visible:underline"
        >
          {copied ? 'Copied' : 'or copy'}
        </button>
      </div>
    </div>
  );
}
