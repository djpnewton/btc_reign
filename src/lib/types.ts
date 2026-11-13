export type Coin = {
  id: number
  name: string
  symbol: string
  slug: string
  mcap: number
  price: number
  image: number
  dagger: boolean
  src: string
  freeze?: string
  vals: number[]
}

export type Dataset = {
  start: string
  end: string
  step: number
  days: number
  coins: Coin[]
}
