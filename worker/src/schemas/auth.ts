import { z } from 'zod';

export const CredentialsBody = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});

// Signup is just credentials + an optional invite token. Carrying the token
// in the same request body keeps the bypass-the-allowlist branch atomic with
// user creation (single Tx). The token bound is generous; the real value is
// 32 base64url chars, but allow some headroom for future format changes.
export const SignupBody = CredentialsBody.extend({
  inviteToken: z.string().min(1).max(256).optional(),
});

export type CredentialsInput = z.infer<typeof CredentialsBody>;
export type SignupInput = z.infer<typeof SignupBody>;
