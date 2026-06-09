import { useMutation, useQueryClient } from '@tanstack/react-query';
import { acceptInvite } from '../../api/boards';
import { BOARDS_QUERY_KEY } from './useBoards';

export function useAcceptInvite() {
  const qc = useQueryClient();
  return useMutation<{ boardId: string }, Error, string>({
    mutationFn: (token) => acceptInvite(token),
    onSuccess: () => {
      // Membership changed — refetch the boards list so the new board
      // appears under "Shared with you". We could splice it in optimistically,
      // but a single round-trip is cheap and avoids drift if other state on
      // the board changed too.
      qc.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  });
}
