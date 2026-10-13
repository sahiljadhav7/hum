// The Bar's looks: names, palettes and the small text helpers they share.
// Colors are documented in DESIGN.md. Hex palettes need truecolor; without it
// Claude Code rounds into the xterm 256-color cube (browns turn grey, olive or
// pink), so each painted look carries a graphite twin built only from exact
// grayscale-ramp entries.
import type { Style } from '../../types'

export const STYLES: Style[] = ['glossy', 'minimal', 'glass']
export const STYLE_NAMES: Record<Style, string> = { glossy: 'Glossy', minimal: 'Minimal', glass: 'Glass' }
export const isStyle = (s: string): s is Style => (STYLES as string[]).includes(s)

/** Text colors for a look; `undefined` means the terminal's own (NO_COLOR). */
export type Ink = {
  title?: string
  artist?: string
  main?: string
  quiet?: string
  hover?: string
  played?: string
  track?: string
  time?: string
}

/** Glossy: two tones, the title row lighter, read as a sheen. */
export const GLOSSY = {
  truecolor: {
    rows: ['#7A695B', '#68584B'],
    ink: { title: '#F6F1EC', artist: '#CBBFB4', main: '#F1EBE5', quiet: '#C4B8AD', hover: '#FFFFFF', played: '#F6F1EC', track: '#4B3F35', time: '#CBBFB4' },
  },
  graphite: {
    rows: ['#585858', '#444444'],
    ink: { title: '#EEEEEE', artist: '#BCBCBC', main: '#E4E4E4', quiet: '#A8A8A8', hover: '#FFFFFF', played: '#EEEEEE', track: '#262626', time: '#BCBCBC' },
  },
} as const

/** Minimal: no background; Claude Code theme keys, so light and dark both work. */
export const MINIMAL_INK: Ink = {
  title: 'text', artist: 'inactive', main: 'text', quiet: 'inactive', hover: 'text', played: 'text', track: 'subtle', time: 'inactive',
}

/** Glass: a 3-row capsule with an inset card (the user's screenshot). */
export const GLASS = {
  truecolor: {
    rows: ['#7D6C5D', '#6A594C', '#594A3E'], // the gradient, used where the ends are images
    flat: '#6A594C',
    card: ['#4F4237', '#4A3D33', '#463A30'],
    flatCard: '#4A3D33',
    ink: { title: '#F5F0EB', artist: '#B7ABA0', main: '#E9E2DA', quiet: '#E9E2DA', hover: '#FFFFFF', played: '#EDE6DF', track: '#2E251F', time: '#B7ABA0' },
    swatch: null as string | null, // null: the track's own placeholder color
  },
  graphite: {
    rows: ['#585858', '#4E4E4E', '#444444'],
    flat: '#4E4E4E',
    card: ['#3A3A3A', '#3A3A3A', '#3A3A3A'],
    flatCard: '#3A3A3A',
    ink: { title: '#EEEEEE', artist: '#BCBCBC', main: '#E4E4E4', quiet: '#E4E4E4', hover: '#FFFFFF', played: '#EEEEEE', track: '#262626', time: '#BCBCBC' },
    swatch: '#6C6C6C' as string | null,
  },
}

/** Terminal cells a string takes; every glyph hum draws is one cell wide. */
export const cells = (text: string) => [...text].length

/** `text` cut to `width` cells with an ellipsis. */
export const fit = (text: string, width: number) => {
  const chars = [...text]
  return chars.length > width ? chars.slice(0, Math.max(0, width - 1)).join('') + '…' : text
}

/** A fixed 7-cell countdown, so nothing shifts when it changes length. */
export const countdown = (remainingMs: number) => {
  const s = Math.max(0, Math.round(remainingMs / 1000))
  return ` -${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`.padStart(7)
}

export const volumeGlyph = (volume: number) => (volume === 0 ? '◁× ' : volume < 0.5 ? '◁) ' : '◁))')

/** Blends two 0xRRGGBB colors. */
export const mix = (a: number, b: number, t: number) => {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

export const toHex = (c: number) => `#${c.toString(16).padStart(6, '0').toUpperCase()}`
