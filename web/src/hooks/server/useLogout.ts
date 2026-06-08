import { useMutation } from '@tanstack/react-query';
import { logout } from '../../api/auth';

export function useLogout() {
  return useMutation<{ ok: true }, Error, void>({
    mutationFn: logout,
    onSettled: () => {
      // Hard reload. The cookie is cleared server-side; the next mount
      // fetches /me, gets a 401, and AuthGate renders LoginScreen — no
      // TanStack cache-timing edges, and no stale board/item data can
      // leak to the next user who logs in this tab.
      window.location.reload();
    },
  });
}
