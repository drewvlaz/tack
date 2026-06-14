import { useEffect, useMemo, useState } from 'react';
import { useAddItem } from '../../hooks/server/useAddItem';
import { useBoards } from '../../hooks/server/useBoards';
import { useBoardsStore } from '../../store/boards';
import Button from '../shared/Button';

// Bookmarklet drop-zone. The bookmarklet (see `lib/bookmarklet.ts`) opens
// this page in a new tab and, after we signal `tack:ready` to the opener,
// posts the harvested DOM payload back. We then run it through the worker's
// `parseFromHtml` path (skips the bot-blocked live fetch) and add the item
// to a board the user picks.
//
// This is the rescue path for sites that fingerprint-block the Worker
// (Akamai BM, DataDome, etc.). Wayback Machine handles the silent-rescue
// case for paste-URL; this handles everything Wayback misses.

type ImportPayload = { url: string; html: string };

function isImportMessage(data: unknown): data is ImportPayload & {
  type: 'tack:import';
} {
  if (!data || typeof data !== 'object') {
    return false;
  }
  const d = data as Record<string, unknown>;
  return (
    d.type === 'tack:import' &&
    typeof d.url === 'string' &&
    typeof d.html === 'string'
  );
}

export default function ImportScreen() {
  const [payload, setPayload] = useState<ImportPayload | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // We can't validate `e.origin` here — it's whatever site the user was
      // visiting when they clicked the bookmarklet. Trust comes from the
      // shape check + the fact that the user explicitly invoked us. The
      // data eventually flows into a `protectedProcedure` over their
      // authenticated session, so the worker still scopes everything to
      // their userId.
      if (isImportMessage(e.data)) {
        setPayload({ url: e.data.url, html: e.data.html });
      }
    };
    window.addEventListener('message', onMessage);
    // Tell the opener we're listening. We don't know the opener's origin
    // (could be any product page on the web), so '*' is the only choice.
    // The payload is a one-way "ack" with no sensitive content.
    window.opener?.postMessage('tack:ready', '*');
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <div className="bg-surface flex h-screen w-screen items-center justify-center">
      <div className="w-full max-w-sm px-8">
        <p className="text-fg-subtle mb-8 text-center text-[11px] font-medium tracking-[0.18em] uppercase">
          Tack
        </p>
        {payload ? (
          <ImportConfirm payload={payload} />
        ) : (
          <Waiting />
        )}
      </div>
    </div>
  );
}

function Waiting() {
  return (
    <>
      <h1 className="text-fg mb-1 text-base font-medium">Waiting for page…</h1>
      <p className="text-fg-muted text-xs">
        If nothing happens, click the bookmarklet from the product page again.
      </p>
    </>
  );
}

function ImportConfirm({ payload }: { payload: ImportPayload }) {
  const { boards, isLoading } = useBoards();
  const activeBoardId = useBoardsStore((s) => s.activeBoardId);
  const addItem = useAddItem();
  // `null` = no explicit pick yet → fall through to the active board (or the
  // first one). This is the "derived state" pattern from the React docs —
  // never sync via useEffect, just compute on render so the user's pick
  // immediately overrides the default.
  const [picked, setPicked] = useState<string | null>(null);
  const boardId =
    picked ??
    boards.find((b) => b.id === activeBoardId)?.id ??
    boards[0]?.id ??
    null;

  const hostname = useMemo(() => {
    try {
      return new URL(payload.url).hostname;
    } catch {
      return payload.url;
    }
  }, [payload.url]);

  function submit() {
    if (!boardId) {
      return;
    }
    addItem.mutate(
      { url: payload.url, html: payload.html, boardId, x: 0, y: 0 },
      {
        onSuccess: () => {
          // Give the user a beat to see the success state before closing.
          setTimeout(() => window.close(), 500);
        },
      },
    );
  }

  if (addItem.isSuccess) {
    return (
      <>
        <h1 className="text-fg mb-1 text-base font-medium">Saved</h1>
        <p className="text-fg-muted text-xs">Closing…</p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-fg mb-1 text-base font-medium">Save to Tack</h1>
      <p className="text-fg-muted mb-6 text-xs break-all">{hostname}</p>

      <label className="block">
        <span className="text-fg-muted mb-1.5 block text-[11px] font-medium tracking-wide uppercase">
          Board
        </span>
        <select
          value={boardId ?? ''}
          onChange={(e) => setPicked(e.target.value)}
          disabled={isLoading || addItem.isPending}
          className="bg-surface-raised text-fg ring-border/60 focus-visible:ring-focus h-9 w-full rounded-md px-2.5 text-sm ring-1 outline-none focus-visible:ring-2"
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>

      {addItem.error && (
        <p className="text-danger mt-3 text-xs">
          {addItem.error instanceof Error
            ? addItem.error.message
            : 'Something went wrong. Try again.'}
        </p>
      )}

      <div className="mt-6 flex gap-2">
        <Button
          variant="secondary"
          block
          disabled={addItem.isPending}
          onClick={() => window.close()}
        >
          Cancel
        </Button>
        <Button
          block
          loading={addItem.isPending}
          disabled={!boardId || isLoading}
          onClick={submit}
        >
          Save
        </Button>
      </div>
    </>
  );
}
