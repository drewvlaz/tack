import { useMutation, useQueryClient } from '@tanstack/react-query';
import { signup, type SignupResponse } from '../../api/auth';
import { ME_QUERY_KEY } from './useMe';

export function useSignup() {
  const qc = useQueryClient();
  return useMutation<
    SignupResponse,
    Error,
    { email: string; password: string; inviteToken?: string }
  >({
    mutationFn: ({ email, password, inviteToken }) =>
      signup(email, password, inviteToken),
    onSuccess: (user) => {
      // Strip invitedBoardId before cacheing — ME_QUERY_KEY holds `User`,
      // not the signup-only auxiliary fields.
      qc.setQueryData(ME_QUERY_KEY, { id: user.id, email: user.email });
    },
  });
}
