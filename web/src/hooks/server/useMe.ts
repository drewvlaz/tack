import { useQuery } from '@tanstack/react-query';
import { AuthFetchError, fetchMe, type User } from '../../api/auth';

export const ME_QUERY_KEY = ['me'] as const;

// Returns the current user, or `null` for "logged out". A 401 from /me is the
// normal logged-out path — squash it into `null` so AuthGate has a single
// boolean check (`if (!user) return <LoginScreen />`) and so `useLogout` can
// flip the state synchronously by writing `null` into the cache.
async function fetchMeOrNull(): Promise<User | null> {
  try {
    return await fetchMe();
  } catch (err) {
    if (err instanceof AuthFetchError && err.status === 401) {
      return null;
    }
    throw err;
  }
}

export function useMe() {
  return useQuery<User | null>({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMeOrNull,
    staleTime: Infinity,
    retry: false,
  });
}
