import { customAlphabet } from 'nanoid';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export const genId = customAlphabet(ALPHABET, 21);
