import { useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveBoard } from '../../api/boards';
import { BOARDS_QUERY_KEY } from './useBoards';

export function useLeaveBoard() {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (boardId) => leaveBoard(boardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BOARDS_QUERY_KEY });
    },
  });
}
