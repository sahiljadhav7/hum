export type Shown = {
  title: string
  url: string
  /** What happened, shown dim on the last row. */
  status: string
  width: number
  height: number
  /** Decoded 64 px pixels, RGBA base64; '' until decoded. */
  rgba: string
  /** Raster cells for the 2- and 3-cell fallbacks; '' until decoded. */
  cells2: string
  cells3: string
  /** Glass candidates: a 4×2-cell Raster and the average color. */
  cells4x2: string
  average: string
}

/** `widths`: 2 vs 3 cells. `glass`: the Glass card's Cover candidates. */
export type View = 'widths' | 'glass'

declare module 'claude-code' {
  interface PluginState {
    'hum-cover-proto': { shown: Shown; view: View }
  }
}
