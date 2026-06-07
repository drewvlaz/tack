export type BoardItem = {
  id: string
  itemId: string
  title: string | null
  price: number | null
  currency: string
  imageUrl: string | null
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

export type ParseResult = {
  title: string | null
  brand: string | null
  price: number | null
  imageUrl: string | null
}
