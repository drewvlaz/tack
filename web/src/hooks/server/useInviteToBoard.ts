import { useMutation } from '@tanstack/react-query';
import { inviteToBoard } from '../../api/boards';

// Returns the raw token + expiry. The view composes the share URL because
// it owns the origin (window.location). Keeping URL construction out of the
// hook means tests don't need to mock window.
export function useInviteToBoard() {
  return useMutation<{ token: string; expiresAt: number }, Error, string>({
    mutationFn: (boardId) => inviteToBoard(boardId),
  });
}
