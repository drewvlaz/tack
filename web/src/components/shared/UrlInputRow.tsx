import { ArrowRight } from 'lucide-react';
import { type KeyboardEvent, type Ref } from 'react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  isPending: boolean;
  inputRef?: Ref<HTMLInputElement>;
  inputClassName?: string;
  onEnter?: (value: string) => void;
};

export default function UrlInputRow({
  value,
  onChange,
  isPending,
  inputRef,
  inputClassName,
  onEnter,
}: Props) {
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) {
      return;
    }
    // Stop the window hotkey bus AND native implicit-submit so Enter has
    // exactly one owner. Read the DOM value — paste + Enter in one tick
    // leaves React state stale, and some browsers use the first Enter to
    // commit autofill rather than submit.
    e.preventDefault();
    e.stopPropagation();
    onEnter?.(e.currentTarget.value);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="text"
        inputMode="url"
        name="tack-product-url"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Product URL"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Paste product URL…"
        disabled={isPending}
        className={`text-fg placeholder:text-fg-subtle bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50 ${
          inputClassName ?? 'min-w-0 flex-1'
        }`}
      />
      <button
        type="submit"
        aria-label="Add URL"
        disabled={isPending}
        className={`bg-fg text-surface focus-visible:ring-focus flex h-7 w-7 items-center justify-center rounded-full outline-none transition-opacity focus-visible:ring-2 disabled:opacity-30 ${
          !value.trim() ? 'opacity-30' : ''
        }`}
      >
        {isPending ? (
          <span className="border-surface block h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
        ) : (
          <ArrowRight size={13} strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </div>
  );
}
