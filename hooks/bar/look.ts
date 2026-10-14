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
  },
  graphite: {
    rows: ['#585858', '#4E4E4E', '#444444'],
    flat: '#4E4E4E',
    card: ['#3A3A3A', '#3A3A3A', '#3A3A3A'],
    flatCard: '#3A3A3A',
    ink: { title: '#EEEEEE', artist: '#BCBCBC', main: '#E4E4E4', quiet: '#E4E4E4', hover: '#FFFFFF', played: '#EEEEEE', track: '#262626', time: '#BCBCBC' },
  },
}

// East Asian wide characters: Hangul, CJK, kana, fullwidth forms.
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{20000}-\u{3FFFD}]/u
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F/u
const ZERO = /^[\p{Mark}\u200B-\u200D\uFEFF]*$/u
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** Columns one grapheme takes: 2 for emoji and wide characters, 0 for marks and joiners. */
const columns = (g: string) => (EMOJI.test(g) || WIDE.test(g) ? 2 : ZERO.test(g) ? 0 : 1)

/** Terminal cells a string takes (track and playlist names can hold emoji and CJK). */
export const cells = (text: string) => [...graphemes.segment(text)].reduce((sum, { segment }) => sum + columns(segment), 0)

/** `text` cut to `width` cells with an ellipsis. */
export const fit = (text: string, width: number) => {
  if (cells(text) <= width) return text
  let out = ''
  let used = 0
  for (const { segment } of graphemes.segment(text)) {
    const w = columns(segment)
    if (used + w > width - 1) break
    out += segment
    used += w
  }
  return width <= 0 ? '' : out + '…'
}

/** A fixed 7-cell countdown, so nothing shifts when it changes length. */
export const countdown = (remainingMs: number) => {
  const s = Math.max(0, Math.round(remainingMs / 1000))
  return ` -${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`.padStart(7)
}

export const volumeGlyph = (volume: number) => (volume === 0 ? '◁× ' : volume < 0.5 ? '◁) ' : '◁))')
