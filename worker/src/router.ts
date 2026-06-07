import { boardsRouter } from './routers/boards';
import { parseUrlProcedure } from './routers/parser';
import { router } from './trpc/init';

export const appRouter = router({
  boards: boardsRouter,
  parseUrl: parseUrlProcedure,
});

export type AppRouter = typeof appRouter;
