import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@fashion-mood/worker/router';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${import.meta.env.VITE_API_URL ?? 'http://localhost:8787'}/trpc`,
    }),
  ],
});

type RouterOutputs = inferRouterOutputs<AppRouter>;

export type BoardItem = RouterOutputs['boards']['getItems'][number];
export type Board = RouterOutputs['boards']['list'][number];
export type ParseResult = RouterOutputs['parseUrl'];

export type RealItem = BoardItem & { kind: 'real' };
export type SkeletonItem = {
  kind: 'skeleton';
  tempId: string;
  sourceUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type CanvasItem = RealItem | SkeletonItem;
