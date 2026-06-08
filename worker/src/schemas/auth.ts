import { z } from 'zod';

export const CredentialsBody = z.object({
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
});

export type CredentialsInput = z.infer<typeof CredentialsBody>;
