export type ParsedMeta = {
  title: string | null
  brand: string | null
  price: number | null
  primaryImageUrl: string | null
}

export async function fetchAndParseMeta(_url: string): Promise<ParsedMeta> {
  throw new Error('not implemented')
}
