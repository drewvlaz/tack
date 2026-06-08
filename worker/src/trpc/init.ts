import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

// Requires a valid session. Narrows `ctx.userId` from `string | null` to
// `string` for downstream procedures. Everything user-facing in this app
// is gated behind this — there are no anonymous procedures.
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: { ...ctx, userId: ctx.userId, sessionId: ctx.sessionId },
  });
});
