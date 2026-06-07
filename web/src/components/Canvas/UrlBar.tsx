import { useState } from 'react';

type UrlBarProps = {
  onAdd: (url: string) => void;
  isPending: boolean;
};

export default function UrlBar({ onAdd, isPending }: UrlBarProps) {
  const [value, setValue] = useState('');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const url = value.trim();
    if (!url || isPending) return;
    onAdd(url);
    setValue('');
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-surface-raised ring-border pointer-events-auto absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2 shadow-lg ring-1"
    >
      <input
        type="url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Paste product URL…"
        disabled={isPending}
        className="text-fg placeholder:text-fg-subtle w-[32rem] bg-transparent text-sm outline-none disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={!value.trim() || isPending}
        className="bg-fg text-surface flex h-7 w-7 items-center justify-center rounded-full transition-opacity disabled:opacity-30"
      >
        {isPending ? (
          <span className="border-surface block h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M2 6h8M6 2l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </form>
  );
}
