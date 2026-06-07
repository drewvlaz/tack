import { api } from './client'
import type { ParseResult } from './types'

export function parseUrl(url: string): Promise<ParseResult> {
  return api.post('api/parse-url', { json: { url } }).json<ParseResult>()
}
