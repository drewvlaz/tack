import { customAlphabet } from 'nanoid';

const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 21;

export const genId = customAlphabet(ALPHABET, ID_LENGTH);
