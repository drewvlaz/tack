import { useMutation, useQueryClient } from '@tanstack/react-query';
import { signup, type User } from '../../api/auth';
import { ME_QUERY_KEY } from './useMe';

export function useSignup() {
  const qc = useQueryClient();
  return useMutation<User, Error, { email: string; password: string }>({
    mutationFn: ({ email, password }) => signup(email, password),
    onSuccess: (user) => {
      qc.setQueryData(ME_QUERY_KEY, user);
    },
  });
}
