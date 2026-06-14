import { ArrowRight } from 'lucide-react';
import { type Ref } from 'react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  isPending: boolean;
  inputRef?: Ref<HTMLInputElement>;
  inputClassName?: string;
};

export default function UrlInputRow({
  value,
  onChange,
  isPending,
  inputRef,
  inputClassName,
}: Props) {
  return (
    <>
      <input
        ref={inputRef}
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste product URL…"
        disabled={isPending}
        className={`text-fg placeholder:text-fg-subtle bg-transparent text-sm outline-none disabled:opacity-50 ${
          inputClassName ?? 'flex-1'
        }`}
      />
      <button
        type="submit"
        disabled={!value.trim() || isPending}
        className="bg-fg text-surface flex h-7 w-7 items-center justify-center rounded-full transition-opacity disabled:opacity-30"
      >
        {isPending ? (
          <span className="border-surface block h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" />
        ) : (
          <ArrowRight size={13} strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </>
  );
}
