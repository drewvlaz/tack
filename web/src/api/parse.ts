import { trpc, type ParseResult } from '../lib/trpc'

export type { ParseResult }

export function parseUrl(url: string): Promise<ParseResult> {
  return trpc.parseUrl.mutate({ url })
}
