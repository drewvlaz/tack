import { useMutation, useQueryClient } from '@tanstack/react-query';
import { removeMember } from '../../api/boards';
import { boardMembersQueryKey } from './useBoardMembers';

export function useRemoveMember(boardId: string) {
  const qc = useQueryClient();
  return useMutation<{ ok: true }, Error, string>({
    mutationFn: (userId) => removeMember(boardId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardMembersQueryKey(boardId) });
    },
  });
}
