// Draws the Bar from Now playing. Pure: register.tsx passes in the surface's
// element table, the terminal's capabilities and the click handler, so `$`
// never leaves register.tsx (the engine requires that).
import type { Style } from '../../types'
import { positionAt } from '../player'
import type { NowPlaying } from '../../types'
import type { Command, Playing } from '../player'
import { cells, fit, GLASS, GLOSSY, MINIMAL_INK, volumeGlyph } from './look'
import type { Ink } from './look'
import { capPixels, CELL_H, CELL_W } from './pixels'
import type { SeekProps } from './seek'

/** What the terminal can do, read by register.tsx from the environment. */
export type Caps = {
  /** COLORTERM says 24-bit; otherwise Claude Code rounds hex colors to 256. */
  truecolor: boolean
  /** kitty or Ghostty, not through tmux: Image draws real pixels. */
  images: boolean
  /** NO_COLOR is set: no colors at all. */
  noColor: boolean
}

export type BarInput = {
  style: Style
  columns: number
  now: number
  caps: Caps
}

export type Press = (cmd: Command) => unknown

// Element constructors from `$.ui.resolve(e)`; their prop types vary per surface.
type El = Record<string, any>

/** Client props must be plain data with no undefined fields. */
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value))

const CONTROLS_CELLS = 10 // ◀◀  ❚❚  ▶▶
const ICONS_CELLS = 10 // ⇄  ◁))  ↻
const TIME_CELLS = 7
const SEEK_MAX = 24
const SEEK_MIN = 8
const TITLE_MAX = 30 // Glass's title area
const TITLE_MIN = 6

export function drawBar(el: El, np: NowPlaying, input: BarInput, press: Press) {
  if (np.kind === 'idle') return drawIdle(el, np.hint)
  if (input.caps.noColor) return drawLinear(el, np, input, press, 'plain')
  if (input.style === 'glass') return drawGlass(el, np, input, press)
  return drawLinear(el, np, input, press, input.style)
}

function drawIdle(el: El, hint: string) {
  const { Box, Text } = el
  return (
    <Box flexDirection="row" width="100%" justifyContent="flex-end">
      <Text dimColor>{hint}</Text>
    </Box>
  )
}

type Look = { color?: string; bold?: boolean; underline?: boolean; dimColor?: boolean }

/** A clickable glyph. Hover needs a keyed Box around the Button. */
function control(el: El, key: string, label: string, look: Look, hover: string | undefined, bg: string | undefined, onPress: () => unknown) {
  const { Box, Button, Text } = el
  return (
    <Box key={`${key}-hover`}>
      <Button key={key} plain onPress={onPress}>
        <Text {...look} backgroundColor={bg} hover={hover === undefined ? { inverse: true } : { color: hover, bold: true }}>
          {label}
        </Text>
      </Button>
    </Box>
  )
}

function controls(el: El, np: Playing, ink: Ink, bg: string | undefined, press: Press) {
  const { Text } = el
  const gap = (n: number) => <Text backgroundColor={bg}>{' '.repeat(n)}</Text>
  const main = { color: ink.main }
  return [
    control(el, 'prev', '◀◀', main, ink.hover, bg, () => press({ type: 'previous' })),
    gap(2),
    control(el, 'play', np.isPlaying ? '❚❚' : ' ▶', main, ink.hover, bg, () => press({ type: 'toggle' })),
    gap(2),
    control(el, 'next', '▶▶', main, ink.hover, bg, () => press({ type: 'next' })),
  ]
}

function icons(el: El, np: Playing, ink: Ink, bg: string | undefined, press: Press) {
  const { Text } = el
  const gap = (n: number) => <Text backgroundColor={bg}>{' '.repeat(n)}</Text>
  const quiet = { color: ink.quiet }
  // On is a shape (bold + underline), not only a color, and differs from hover.
  const on = ink.hover === undefined ? { bold: true, underline: true } : { color: ink.hover, bold: true, underline: true }
  const volume = np.canSetVolume
    ? control(el, 'volume', volumeGlyph(np.volume), quiet, ink.hover, bg, () => press({ type: 'mute' }))
    : (
        <Text key="volume" color={ink.quiet} dimColor backgroundColor={bg}>
          {volumeGlyph(np.volume)}
        </Text>
      )
  return [
    control(el, 'shuffle', '⇄', np.isShuffle ? on : quiet, ink.hover, bg, () => press({ type: 'shuffle' })),
    gap(2),
    volume,
    gap(2),
    control(el, 'repeat', np.repeat === 'track' ? '↻¹' : '↻ ', np.repeat === 'off' ? quiet : on, ink.hover, bg, () => press({ type: 'repeat' })),
  ]
}

// Glossy, Minimal and the NO_COLOR fallback share one two-row layout:
//                         Muddy Feet (feat Sia) · Miley Cyrus, Sia
//   ◀◀  ❚❚  ▶▶   ━━━━━━━━╸────────   -1:14   ⇄  ◁))  ↻
function drawLinear(el: El, np: Playing, input: BarInput, press: Press, mode: 'glossy' | 'minimal' | 'plain') {
  const { Box, Text, Client, Image } = el
  const { caps } = input
  const isGlossy = mode === 'glossy'
  const palette = caps.truecolor ? GLOSSY.truecolor : GLOSSY.graphite
  const bg: [string | undefined, string | undefined] = isGlossy ? [palette.rows[0], palette.rows[1]] : [undefined, undefined]
  const ink: Ink = isGlossy ? palette.ink : mode === 'minimal' ? MINIMAL_INK : {}

  // Widths are measured, never thresholds: controls, gap, Seek bar + time, gap,
  // icons. Glossy adds 2 cells of padding inside each end, and a 2-cell image
  // end in kitty.
  const pad = isGlossy ? 2 : 0
  const cap = isGlossy && caps.images ? 2 : 0
  const room = input.columns - 2 - 2 * (pad + cap)
  // The icons drop first, while the Seek bar can still be full length; only then does it shrink.
  const hasIcons = room - (CONTROLS_CELLS + 3 + TIME_CELLS + 3 + ICONS_CELLS) >= SEEK_MAX
  const fixed = CONTROLS_CELLS + 3 + TIME_CELLS + (hasIcons ? 3 + ICONS_CELLS : 0)
  const line = Math.max(SEEK_MIN, Math.min(SEEK_MAX, room - fixed))
  const width = fixed + line

  const rest = ` · ${np.track.artist}`
  const title = fit(np.track.title, Math.max(4, width - cells(rest)))
  const shownRest = fit(rest, Math.max(0, width - cells(title)))
  const lead = Math.max(0, width - cells(title) - cells(shownRest))
  const space = (n: number, row: 0 | 1) => <Text backgroundColor={bg[row]}>{' '.repeat(Math.max(0, n))}</Text>

  const seek: SeekProps = plain({
    cells: line,
    positionMs: positionAt(np, input.now),
    durationMs: np.track.durationMs,
    isPlaying: np.isPlaying,
    line: 'smooth',
    showTime: true,
    played: ink.played,
    track: ink.track,
    time: ink.time,
    bg: bg[1],
  })
  const end = (side: 'l' | 'r') =>
    cap > 0 && (
      <Image key={`cap-${side}`} source={{ rgba: capPixels(side, palette.rows, cap), width: cap * CELL_W, height: 2 * CELL_H }} columns={cap} rows={2} alt=" " />
    )
  const padding = (key: string) =>
    pad > 0 && (
      <Box key={key} flexDirection="column">
        {space(pad, 0)}
        {space(pad, 1)}
      </Box>
    )

  return (
    <Box flexDirection="row" width="100%" justifyContent="flex-end">
      {end('l')}
      {padding('pad-l')}
      <Box flexDirection="column" width={width}>
        <Box flexDirection="row">
          {space(lead, 0)}
          <Text color={ink.title} backgroundColor={bg[0]} bold>
            {title}
          </Text>
          <Text color={ink.artist} dimColor={ink.artist === undefined} backgroundColor={bg[0]}>
            {shownRest}
          </Text>
        </Box>
        <Box flexDirection="row">
          {controls(el, np, ink, bg[1], press)}
          {space(3, 1)}
          <Client key="seek" module="./seek.tsx" props={seek} />
          {hasIcons && space(3, 1)}
          {hasIcons && icons(el, np, ink, bg[1], press)}
        </Box>
      </Box>
      {padding('pad-r')}
      {end('r')}
    </Box>
  )
}

// Glass: three rows like the user's screenshot. Controls left, an inset card
// with the title, artist and a thin Seek bar along its bottom,
// icons right. Flat and square without images; smooth ends and a gradient
// where the ends are pictures.
function drawGlass(el: El, np: Playing, input: BarInput, press: Press) {
  const { Box, Text, Client, Image } = el
  const { caps } = input
  const palette = caps.truecolor ? GLASS.truecolor : GLASS.graphite
  const rowBg = caps.images ? palette.rows : [palette.flat, palette.flat, palette.flat]
  const cardBg = caps.images ? palette.card : [palette.flatCard, palette.flatCard, palette.flatCard]
  const endCells = caps.images ? 3 : 0 // a smooth half disc needs ~3 cells across

  // Widths: ends, padding 2+2, controls, gaps 3+3, card (1 + titleCells + 1), icons.
  const base = 2 * endCells + 4 + CONTROLS_CELLS + 6 + 2
  // The icons drop first, while the title area can still be full width; only then does it shrink.
  const hasIcons = input.columns - 2 - base - ICONS_CELLS >= TITLE_MAX
  const titleCells = Math.max(TITLE_MIN, Math.min(TITLE_MAX, input.columns - 2 - base - (hasIcons ? ICONS_CELLS : 0)))

  const blank = (key: string, width: number) => (
    <Box key={key} flexDirection="column">
      {[0, 1, 2].map(r => (
        <Text backgroundColor={rowBg[r]}>{' '.repeat(width)}</Text>
      ))}
    </Box>
  )
  const middle = (key: string, width: number, children: unknown) => (
    <Box key={key} flexDirection="column">
      <Text backgroundColor={rowBg[0]}>{' '.repeat(width)}</Text>
      <Box flexDirection="row">{children}</Box>
      <Text backgroundColor={rowBg[2]}>{' '.repeat(width)}</Text>
    </Box>
  )
  const pad = (s: string) => s + ' '.repeat(Math.max(0, titleCells - cells(s)))
  const seek: SeekProps = plain({
    cells: titleCells,
    positionMs: positionAt(np, input.now),
    durationMs: np.track.durationMs,
    isPlaying: np.isPlaying,
    line: 'underline',
    showTime: false,
    played: palette.ink.played,
    track: palette.ink.track,
    bg: cardBg[2],
  })
  const end = (side: 'l' | 'r') =>
    endCells > 0 && (
      <Image key={`cap-${side}`} source={{ rgba: capPixels(side, rowBg, endCells), width: endCells * CELL_W, height: 3 * CELL_H }} columns={endCells} rows={3} alt=" " />
    )

  return (
    <Box flexDirection="row" width="100%" justifyContent="flex-end">
      <Box flexDirection="row">
        {end('l')}
        {blank('pad-l', 2)}
        {middle('controls', CONTROLS_CELLS, controls(el, np, palette.ink, rowBg[1], press))}
        {blank('gap-1', 3)}
        <Box key="card" flexDirection="column">
          <Text backgroundColor={cardBg[0]} color={palette.ink.title} bold>
            {' ' + pad(fit(np.track.title, titleCells)) + ' '}
          </Text>
          <Text backgroundColor={cardBg[1]} color={palette.ink.artist}>
            {' ' + pad(fit(np.track.artist, titleCells)) + ' '}
          </Text>
          <Box flexDirection="row">
            <Text backgroundColor={cardBg[2]}> </Text>
            <Client key="seek" module="./seek.tsx" props={seek} />
            <Text backgroundColor={cardBg[2]}> </Text>
          </Box>
        </Box>
        {blank('gap-2', 3)}
        {hasIcons && middle('icons', ICONS_CELLS, icons(el, np, palette.ink, rowBg[1], press))}
        {blank('pad-r', 2)}
        {end('r')}
      </Box>
    </Box>
  )
}
