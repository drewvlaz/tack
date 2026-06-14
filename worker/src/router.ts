import { boardsRouter } from './routers/boards';
import { parseFromHtmlProcedure, parseUrlProcedure } from './routers/parser';
import { router } from './trpc/init';

export const appRouter = router({
  boards: boardsRouter,
  parseUrl: parseUrlProcedure,
  parseFromHtml: parseFromHtmlProcedure,
});

export type AppRouter = typeof appRouter;
