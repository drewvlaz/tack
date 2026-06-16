import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { HotkeyProvider } from './hooks/HotkeyProvider';
import './index.css';
import { BOARDS_QUERY_KEY } from './hooks/server/useBoards';
import { useToastsStore } from './store/toasts';

// FORBIDDEN on a board-scoped mutation means the caller's role on the board
// changed since the last boards refetch (most commonly: owner just demoted
// them). The mutation's per-hook onError still rolls back optimistic state;
// this global handler invalidates the boards list so the UI re-gates into
// the right read-only/edit mode on the next render. No bespoke retry.
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      const code = (error as { data?: { code?: string } } | null)?.data?.code;
      if (code !== 'FORBIDDEN') {
        return;
      }
      useToastsStore.getState().show({
        kind: 'error',
        message: 'Access to this board changed; refreshing.',
      });
      // Refetch boards so any stale `role` in the cache updates and gating
      // re-evaluates. Items also re-evaluate via role change because
      // components read role through useBoardRole.
      queryClient.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  }),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <HotkeyProvider>
        <App />
      </HotkeyProvider>
    </QueryClientProvider>
  </StrictMode>,
);
