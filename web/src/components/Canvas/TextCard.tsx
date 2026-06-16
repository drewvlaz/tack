import { motion } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';

// Maps the persisted `textColorToken` to a Tailwind class backed by the
// design tokens in index.css. Add new tokens here when the picker exposes
// them — unknown / null falls back to `text-fg`.
const COLOR_TOKEN_CLASSES: Record<string, string> = {
  fg: 'text-fg',
  'fg-muted': 'text-fg-muted',
  'fg-subtle': 'text-fg-subtle',
};

const ALIGN_CLASSES: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_FONT_WEIGHT = 400;

type TextCardProps = {
  id: string;
  content: string;
  fontSize: number | null;
  fontWeight: number | null;
  colorToken: string | null;
  align: 'left' | 'center' | 'right' | null;
  x: number;
  y: number;
  zIndex?: number;
  // Enables dblclick → edit. Viewers (no BoardEdit) get a static text item.
  canEdit?: boolean;
  // Fires on commit when the new value differs from the current `content`.
  // No-op call sites can omit; the component still tracks edit state so
  // viewers can dblclick and see no effect rather than triggering a server
  // round-trip with the old value.
  onCommit?: (next: string) => void;
};

// Canvas text item. View by default; double-click switches to a textarea
// for inline editing. Enter commits, Esc cancels, blur commits. Size is
// content-driven via `field-sizing: content` so the textarea grows with
// the typed value (TAC-3 invariant: no resize handles for v1 text).
export default function TextCard({
  content,
  fontSize,
  fontWeight,
  colorToken,
  align,
  x,
  y,
  zIndex = 0,
  canEdit = false,
  onCommit,
}: TextCardProps) {
  const [editing, setEditing] = useState(false);
  // Draft only matters during edit — initialized fresh on every enter, so
  // external changes to `content` while we're not editing don't need to
  // be re-synced here.
  const [draft, setDraft] = useState(content);
  // Set by `cancel` so the textarea's onBlur (which the unmount triggers if
  // it was focused) doesn't re-commit. Without this, Esc would commit the
  // typed-but-discarded value before cancel's setDraft propagated.
  const cancellingRef = useRef(false);

  const enterEdit = useCallback(() => {
    if (!canEdit) {
      return;
    }
    setDraft(content);
    setEditing(true);
  }, [canEdit, content]);

  const commit = useCallback(() => {
    if (cancellingRef.current) {
      cancellingRef.current = false;
      return;
    }
    setEditing(false);
    if (draft !== content) {
      onCommit?.(draft);
    }
  }, [draft, content, onCommit]);

  const cancel = useCallback(() => {
    cancellingRef.current = true;
    setDraft(content);
    setEditing(false);
  }, [content]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Shift+Enter inserts a newline; plain Enter commits.
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    },
    [commit, cancel],
  );

  const colorClass =
    (colorToken && COLOR_TOKEN_CLASSES[colorToken]) ?? 'text-fg';
  const alignClass = align ? ALIGN_CLASSES[align] : 'text-left';

  const sharedStyle = {
    fontSize: fontSize ?? DEFAULT_FONT_SIZE,
    fontWeight: fontWeight ?? DEFAULT_FONT_WEIGHT,
  };

  return (
    <motion.div
      style={{ x, y, zIndex }}
      className={`absolute leading-tight ${colorClass} ${alignClass}`}
      onDoubleClick={enterEdit}
    >
      {editing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          rows={1}
          style={{
            ...sharedStyle,
            // field-sizing: content auto-grows the textarea to fit its value
            // without a JS measurement pass. Recent feature; supported on
            // current Chrome/Safari/Firefox. Older browsers fall back to a
            // single-row textarea, which is acceptable for a moodboard tool.
            fieldSizing: 'content',
            background: 'transparent',
            border: 0,
            outline: 'none',
            padding: 0,
            margin: 0,
            resize: 'none',
            color: 'inherit',
            font: 'inherit',
            lineHeight: 'inherit',
            textAlign: 'inherit',
            whiteSpace: 'pre-wrap',
            // Selection on a transparent textarea reads as the browser default
            // (text-cursor). Keep the same visual footprint as the static div.
            display: 'block',
            minWidth: '1ch',
          } as React.CSSProperties}
        />
      ) : (
        <div
          style={{ ...sharedStyle, whiteSpace: 'pre-wrap' }}
          className="select-none"
        >
          {content}
        </div>
      )}
    </motion.div>
  );
}
