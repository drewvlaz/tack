import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardItem, CanvasItem, ParseResult } from '../../lib/trpc';
import { useToastsStore } from '../../store/toasts';
import { useAddItem } from './useAddItem';

vi.mock('../../api/boards', () => ({
  addItem: vi.fn(),
}));

vi.mock('../../api/parse', () => ({
  parseUrl: vi.fn(),
}));

import { addItem } from '../../api/boards';
import { parseUrl } from '../../api/parse';

const addItemMock = vi.mocked(addItem);
const parseUrlMock = vi.mocked(parseUrl);

const BOARD_ID = 'board-1';
const QUERY_KEY = ['boards', BOARD_ID, 'items'] as const;

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function makeParseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    title: 'Some Shirt',
    brand: 'Some Brand',
    description: 'A shirt.',
    price: 100,
    currency: 'USD',
    details: [],
    images: [],
    warnings: [],
    ...overrides,
  } as ParseResult;
}

function makeBoardItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'item-1',
    sourceUrl: 'https://example.com/p/1',
    title: 'Some Shirt',
    brand: 'Some Brand',
    description: 'A shirt.',
    price: 100,
    currency: 'USD',
    details: [],
    images: [],
    x: 10,
    y: 20,
    width: 220,
    height: 280,
    zIndex: 1,
    ...overrides,
  } as BoardItem;
}

beforeEach(() => {
  useToastsStore.setState({ toasts: [] });
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useAddItem', () => {
  it('onMutate inserts a skeleton item at the requested position', async () => {
    const client = makeClient();
    // Seed an existing item so we can verify the skeleton is appended.
    const existing = makeBoardItem({ id: 'existing-1' });
    const existingReal: CanvasItem = { ...existing, kind: 'real' };
    client.setQueryData<CanvasItem[]>([...QUERY_KEY], [existingReal]);

    // Hold parseUrl unresolved so we observe the post-onMutate state.
    let resolveParse: (value: ParseResult) => void = () => {};
    parseUrlMock.mockReturnValue(
      new Promise<ParseResult>((res) => {
        resolveParse = res;
      }),
    );

    const { result } = renderHook(() => useAddItem(), {
      wrapper: makeWrapper(client),
    });

    act(() => {
      result.current.mutate({
        url: 'https://example.com/p/1',
        boardId: BOARD_ID,
        x: 42,
        y: 99,
      });
    });

    await waitFor(() => {
      const items = client.getQueryData<CanvasItem[]>([...QUERY_KEY]) ?? [];
      expect(items).toHaveLength(2);
    });

    const items = client.getQueryData<CanvasItem[]>([...QUERY_KEY]) ?? [];
    expect(items[0]).toEqual(existingReal);

    const skeleton = items[1];
    expect(skeleton.kind).toBe('skeleton');
    if (skeleton.kind !== 'skeleton') {
      throw new Error('unreachable');
    }
    expect(skeleton.sourceUrl).toBe('https://example.com/p/1');
    expect(skeleton.x).toBe(42);
    expect(skeleton.y).toBe(99);
    expect(skeleton.width).toBe(220);
    expect(skeleton.height).toBe(280);
    expect(skeleton.tempId).toMatch(/^skeleton-/);

    // Let the mutation finish so the test cleanup is quiet.
    resolveParse(makeParseResult());
    addItemMock.mockResolvedValue(makeBoardItem());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('onSuccess replaces the skeleton with the real item via tempId', async () => {
    const client = makeClient();
    parseUrlMock.mockResolvedValue(makeParseResult());
    const real = makeBoardItem({ id: 'real-1', title: 'Real Title' });
    addItemMock.mockResolvedValue(real);

    const { result } = renderHook(() => useAddItem(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        url: 'https://example.com/p/1',
        boardId: BOARD_ID,
        x: 0,
        y: 0,
      });
    });

    const items = client.getQueryData<CanvasItem[]>([...QUERY_KEY]) ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ ...real, kind: 'real' });
    // No skeletons left over.
    expect(items.some((i) => i.kind === 'skeleton')).toBe(false);
  });

  it('onError restores the previous list and shows an error toast', async () => {
    const client = makeClient();
    const existing = makeBoardItem({ id: 'existing-1' });
    const existingReal: CanvasItem = { ...existing, kind: 'real' };
    const previous: CanvasItem[] = [existingReal];
    client.setQueryData<CanvasItem[]>([...QUERY_KEY], previous);

    parseUrlMock.mockRejectedValue(new Error('Fetch failed: 403 Forbidden'));

    const { result } = renderHook(() => useAddItem(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current
        .mutateAsync({
          url: 'https://example.com/p/1',
          boardId: BOARD_ID,
          x: 0,
          y: 0,
        })
        .catch(() => {});
    });

    // List rolled back to exactly the previous snapshot — no skeleton lingering.
    expect(client.getQueryData<CanvasItem[]>([...QUERY_KEY])).toEqual(previous);

    const toasts = useToastsStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].kind).toBe('error');
    expect(toasts[0].message).toBe(
      'The site blocked us. Try a different product page.',
    );
  });
});
