import { useMutation } from '@tanstack/react-query';
import { inviteToBoard, type InviteRole } from '../../api/boards';

// Returns the raw token + expiry + role. The view composes the share URL
// because it owns the origin (window.location). Keeping URL construction
// out of the hook means tests don't need to mock window.
export function useInviteToBoard() {
  return useMutation<
    { token: string; expiresAt: number; role: InviteRole },
    Error,
    { boardId: string; role: InviteRole }
  >({
    mutationFn: ({ boardId, role }) => inviteToBoard(boardId, role),
  });
}
