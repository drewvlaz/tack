import type { AppRouter } from '@tack/worker/router';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${import.meta.env.VITE_API_URL ?? 'http://localhost:8787'}/trpc`,
      // Send the session cookie cross-origin. CORS on the worker is
      // explicitly origin-locked with `credentials: true` to accept this.
      fetch: (url, opts) => fetch(url, { ...opts, credentials: 'include' }),
    }),
  ],
});

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type BoardItem = RouterOutputs['boards']['getItems'][number];
export type Board = RouterOutputs['boards']['list'][number];
export type ParseResult = RouterOutputs['parseUrl'];

// `state` distinguishes life-cycle (real vs in-flight skeleton). Separate from
// BoardItem.kind which is the server-side row variant ('product' | 'text').
export type RealItem = BoardItem & { state: 'real' };
export type SkeletonItem = {
  state: 'skeleton';
  tempId: string;
  sourceUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};
export type CanvasItem = RealItem | SkeletonItem;
