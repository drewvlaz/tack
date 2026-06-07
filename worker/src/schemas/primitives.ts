import { z } from 'zod';
import { isSafeUrl } from '../lib/safeFetch';

// Rejects non-http(s) schemes, IP literals in private/loopback/link-local
// ranges, and known metadata-service hostnames. Same predicate that `safeFetch`
// uses at fetch time — schema-level rejection just shifts the failure earlier.
export const SafeUrl = z
  .string()
  .refine(isSafeUrl, { message: 'unsafe or invalid url' });

// z.number() in Zod 4 rejects NaN/Infinity by default. Aliased here so callers
// read intent at the schema site.
export const Coord = z.number();

// Strictly positive — for card dimensions.
export const Size = z.number().positive();

// Z-index is rendered as an integer in CSS; reject non-integers.
export const ZIndex = z.number().int();
