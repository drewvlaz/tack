import { trpc } from '../lib/trpc'

export function reparseItem(id: string) {
  return trpc.items.reparse.mutate({ id })
}
