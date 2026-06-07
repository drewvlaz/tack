import { boardsRouter } from './routers/boards';
import { itemsRouter } from './routers/items';
import { parseUrlProcedure } from './routers/parser';
import { router } from './trpc/init';

export const appRouter = router({
  boards: boardsRouter,
  items: itemsRouter,
  parseUrl: parseUrlProcedure,
});

export type AppRouter = typeof appRouter;
