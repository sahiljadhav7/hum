// Pictures for terminals that draw images (kitty, Ghostty). The engine draws an
// Image as kitty Unicode placeholders, so its cells are text and nothing can be
// drawn over them: only the capsule ends are pictures; anything readable or
// clickable stays cells. Results are cached, so a redraw sends the same bytes
// and the engine doesn't resend the picture.

/** Assumed pixels per cell; the terminal scales the picture to its box. */
export const CELL_W = 10
export const CELL_H = 20

const hex = (c: string) => parseInt(c.slice(1), 16)
const b64 = (bytes: Uint8Array) => (bytes as unknown as { toBase64(): string }).toBase64()

const capCache = new Map<string, string>()

/**
 * A rounded end of the capsule: a half disc, anti-aliased with 4x4 samples per
 * pixel, each band in the color of the cells beside it, clear outside so the
 * terminal's own background shows. RGBA, `columns * CELL_W` by `rows * CELL_H`.
 */
export function capPixels(side: 'l' | 'r', rowColors: readonly string[], columns: number) {
  const key = `${side}:${rowColors.join()}:${columns}`
  const hit = capCache.get(key)
  if (hit) return hit
  const w = columns * CELL_W
  const h = rowColors.length * CELL_H
  const r = h / 2
  const cx = side === 'l' ? w : 0
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const c = hex(rowColors[Math.min(rowColors.length - 1, Math.floor(y / CELL_H))]!)
    for (let x = 0; x < w; x++) {
      let inside = 0
      for (let sy = 0; sy < 4; sy++)
        for (let sx = 0; sx < 4; sx++) {
          const dx = x + (sx + 0.5) / 4 - cx
          const dy = y + (sy + 0.5) / 4 - r
          if (dx * dx + dy * dy <= r * r) inside++
        }
      const i = (y * w + x) * 4
      out[i] = (c >> 16) & 255
      out[i + 1] = (c >> 8) & 255
      out[i + 2] = c & 255
      out[i + 3] = Math.round((inside / 16) * 255)
    }
  }
  const encoded = b64(out)
  capCache.set(key, encoded)
  return encoded
}
