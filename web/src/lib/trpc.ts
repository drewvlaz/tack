import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../worker/src/router'

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${import.meta.env.VITE_API_URL ?? 'http://localhost:8787'}/trpc`,
      methodOverride: 'POST',
    }),
  ],
})

type RouterOutputs = inferRouterOutputs<AppRouter>

export type BoardItem = RouterOutputs['boards']['getItems'][number]
export type Board = RouterOutputs['boards']['list'][number]
export type ParseResult = RouterOutputs['parseUrl']
