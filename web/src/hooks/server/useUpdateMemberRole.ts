import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateMemberRole, type InviteRole } from '../../api/boards';
import { boardMembersQueryKey } from './useBoardMembers';

export function useUpdateMemberRole(boardId: string) {
  const qc = useQueryClient();
  return useMutation<
    { ok: true },
    Error,
    { userId: string; role: InviteRole }
  >({
    mutationFn: ({ userId, role }) => updateMemberRole(boardId, userId, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: boardMembersQueryKey(boardId) });
    },
  });
}
