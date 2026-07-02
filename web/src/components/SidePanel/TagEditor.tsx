import { X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { useBoardRole } from '../../hooks/server/useBoards';
import {
  useBoardTags,
  useEditItemTag,
} from '../../hooks/server/useItemTags';
import { can, P } from '../../lib/permissions';

type Props = {
  boardId: string;
  itemId: string;
  tags: string[];
};

const PLACEHOLDER = 'Add tag…';

export default function TagEditor({ boardId, itemId, tags }: Props) {
  const canEdit = can(useBoardRole(boardId), P.BoardEdit);
  const allTags = useBoardTags(boardId);
  const edit = useEditItemTag(boardId);
  const [draft, setDraft] = useState('');

  const submit = () => {
    const value = draft.trim();
    if (!value) {
      return;
    }
    edit.mutate({ op: 'add', boardItemIds: [itemId], name: value });
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      submit();
    }
  };

  // Datalist suggestions: every board tag minus the ones already on this item.
  const onItem = new Set(tags);
  const suggestions =
    allTags.data?.filter((t) => !onItem.has(t.name)).map((t) => t.name) ?? [];

  return (
    <div className="px-7 py-6">
      <p className="text-fg-muted text-[11px] font-medium tracking-[0.14em] uppercase">
        Tags
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {tags.map((name) => (
          <span
            key={name}
            className="bg-surface-raised text-fg-muted ring-border/60 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1"
          >
            {name}
            {canEdit && (
              <button
                type="button"
                onClick={() =>
                  edit.mutate({ op: 'remove', boardItemIds: [itemId], name })
                }
                aria-label={`Remove tag ${name}`}
                className="text-fg-subtle hover:text-fg -mr-0.5 inline-flex rounded transition-colors"
              >
                <X size={11} strokeWidth={2} aria-hidden />
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={tags.length === 0 ? PLACEHOLDER : '+'}
              aria-label="Add a tag"
              list={`tag-suggestions-${itemId}`}
              className="bg-surface-raised text-fg ring-border/60 placeholder:text-fg-subtle focus-visible:ring-focus min-w-[7rem] flex-1 rounded-full px-2.5 py-1 text-xs outline-none ring-1 transition-shadow focus-visible:ring-2"
            />
            <datalist id={`tag-suggestions-${itemId}`}>
              {suggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        )}
      </div>
    </div>
  );
}
