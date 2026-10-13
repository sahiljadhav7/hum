// PROTOTYPE (throwaway): hum Prototype 1.
// Question: does a mod's row under the prompt (PromptHint) or the band above
// it (AbovePrompt) take plain clicks and drags? Fake player, no Spotify.
// /hum-proto switches placement; /hum-proto style cycles the look
// (glossy, minimal, glass); no popups; the band shows the last click.
// shadcn, Spotify, Glow and Mono were tried and dropped by the user.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Placement, Player } from '../types'

const TRACKS = [
  { durationMs: 229_000, cover: [0x6fa3d8, 0x1d2b3a], title: 'Muddy Feet (feat Sia)', artist: 'Miley Cyrus, Sia' },
  { durationMs: 187_000, cover: [0xffbe0b, 0x3a86ff], title: 'Flowers', artist: 'Miley Cyrus' },
  { durationMs: 41_000, cover: [0x8338ec, 0x06d6a0], title: 'Midnight City', artist: 'M83' },
]

type BarLook = 'glossy' | 'minimal' | 'glass'
const BAR_LOOKS: BarLook[] = ['glossy', 'minimal', 'glass']
const LOOK_NAMES: Record<BarLook, string> = { glossy: 'Glossy', minimal: 'Minimal', glass: 'Glass' }

const player = atom({ plugin: 'hum-proto', key: 'player' } as const, {
  track: 0,
  isPlaying: true,
  isShuffle: false,
  repeat: 'off',
  volume: 0.6,
  durationMs: TRACKS[0]!.durationMs,
  positionMs: 0,
  anchoredAt: 0,
} as Player)
const placement = atom({ plugin: 'hum-proto', key: 'placement' } as const, 'hint' as Placement)
const look = atom({ plugin: 'hum-proto', key: 'look5' } as const, 'glossy' as BarLook)
const lastEvent = atom({ plugin: 'hum-proto', key: 'lastEvent' } as const, 'nothing yet')

const positionAt = (p: Player, now: number) =>
  Math.min(p.durationMs, p.positionMs + (p.isPlaying ? now - p.anchoredAt : 0))

const say = async ($: EngineInterface, text: string) => {
  await update($, lastEvent, () => text)
}

const act = async ($: EngineInterface, what: string, fn: (p: Player, now: number) => Player) => {
  const now = await $.clock.now()
  await update($, player, p => fn({ ...p, positionMs: positionAt(p, now), anchoredAt: now }, now))
  await say($, what)
}

const goTo = (p: Player, track: number): Player => {
  const t = ((track % TRACKS.length) + TRACKS.length) % TRACKS.length
  return { ...p, track: t, durationMs: TRACKS[t]!.durationMs, positionMs: 0 }
}

const mix = (a: number, b: number, t: number) => {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * t)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// One solid color for the Cover where images can't be drawn.
const swatch = (track: number) => {
  const [a, b] = TRACKS[track]!.cover
  return `#${mix(a!, b!, 0.4).toString(16).padStart(6, '0')}`
}

// Terminal cells a string takes; every glyph used here is one cell.
const cells = (text: string) => [...text].length

const fit = (text: string, width: number) => {
  const chars = [...text]
  const cut = chars.length > width ? chars.slice(0, Math.max(0, width - 1)).join('') + '…' : text
  return cut + ' '.repeat(Math.max(0, width - Math.min(chars.length, width)))
}

// The glass capsule, as close to the screenshot as cells allow. Three rows:
// a light-to-dark gradient stands in for the frosted gloss; ▗▐▝ / ▖▌▘ round
// the ends; an inset darker card holds the Cover, title, artist and a thin
// progress line along its bottom edge.
const GLASS = {
  rows: ['#7D6C5D', '#6A594C', '#594A3E'],
  card: ['#4F4237', '#4A3D33', '#463A30'],
  flat: '#6A594C',
  flatCard: '#4A3D33',
  icon: '#E9E2DA',
  hover: '#FFFFFF',
  title: '#F5F0EB',
  artist: '#B7ABA0',
  played: '#EDE6DF',
  unplayed: '#2E251F',
}

// Glass without truecolor: the browns round to olive green and the artist
// beige to pink (the user: "I don't like the pink and green one"). Exact
// grayscale-ramp entries only, so nothing shifts; same graphite as Glossy.
const GLASS_256 = {
  rows: ['#585858', '#4E4E4E', '#444444'],
  card: ['#3A3A3A', '#3A3A3A', '#3A3A3A'],
  flat: '#4E4E4E',
  flatCard: '#3A3A3A',
  icon: '#E4E4E4',
  hover: '#FFFFFF',
  title: '#EEEEEE',
  artist: '#BCBCBC',
  played: '#EEEEEE',
  unplayed: '#262626',
}

// Real pixels where the terminal shows images (kitty, Ghostty; not through
// tmux). The engine draws images as kitty Unicode placeholders, so an image's
// cells are text: nothing can be drawn over them. Hence the hybrid: smooth
// caps and the Cover are images, everything readable or clickable is cells.
async function canShowImages($: EngineInterface) {
  const tmux = await $.env.get('TMUX')
  if (tmux !== undefined && tmux !== '') return false
  const term = await $.env.get('TERM')
  const program = await $.env.get('TERM_PROGRAM')
  const kittyWindow = await $.env.get('KITTY_WINDOW_ID')
  return term === 'xterm-kitty' || term === 'xterm-ghostty' || program === 'ghostty' || kittyWindow !== undefined
}

const CELL_W = 10 // assumed pixels per cell; the terminal scales the picture to its box
const CELL_H = 20
const hex = (c: string) => parseInt(c.slice(1), 16)
const b64 = (bytes: Uint8Array) => (bytes as unknown as { toBase64(): string }).toBase64()

// A rounded end of the capsule: a half disc, anti-aliased (4x4 samples per
// pixel), each row band in the same color as the cells beside it, clear
// outside so the terminal's own background shows.
const capCache = new Map<string, string>()
const capPixels = (side: 'l' | 'r', rows: string[], columns: number) => {
  const key = `${side}:${rows.join()}:${columns}`
  const hit = capCache.get(key)
  if (hit) return hit
  const w = columns * CELL_W
  const h = rows.length * CELL_H
  const r = h / 2
  const cx = side === 'l' ? w : 0
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const c = hex(rows[Math.min(rows.length - 1, Math.floor(y / CELL_H))]!)
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

// The Cover as a picture with rounded corners; corners painted in the card
// color (an image cell has no cell background behind it to show through).
const coverCache = new Map<string, string>()
const coverPixels = (track: number, columns: number, rows: number, card: string | null) => {
  const key = `${track}:${columns}x${rows}:${card}`
  const hit = coverCache.get(key)
  if (hit) return hit
  const [a, b] = TRACKS[track]!.cover
  const w = columns * CELL_W
  const h = rows * CELL_H
  const rad = 6
  const bg = card === null ? 0 : hex(card) // null: clear corners over the terminal's own background
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const cx = Math.min(Math.max(x + 0.5, rad), w - rad)
      const cy = Math.min(Math.max(y + 0.5, rad), h - rad)
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      const cover = Math.max(0, Math.min(1, rad + 0.5 - d))
      const c = mix(a!, b!, Math.min(1, (y + x * 0.4) / (h + w * 0.4)))
      const m = card === null ? c : mix(bg, c, cover)
      const i = (y * w + x) * 4
      out[i] = (m >> 16) & 255
      out[i + 1] = (m >> 8) & 255
      out[i + 2] = m & 255
      out[i + 3] = card === null ? Math.round(cover * 255) : 255
    }
  const encoded = b64(out)
  coverCache.set(key, encoded)
  return encoded
}

// Minimal: smooth and minimalist (the user's ask after Glass). No filled
// backgrounds, theme colors only (light and dark), two rows, right-aligned:
//                          Muddy Feet (feat Sia) · Miley Cyrus, Sia
//   ◀◀  ❚❚  ▶▶   ━━━━━━━╸────────  -1:14   ⇄  ◁))  ↻   [cover, kitty only]
// The progress line moves in half-cell steps (━ … ╸ on a light ─ track).
// Glossy: Minimal on a warm frosted capsule (the user's ask: "a glossy
// background"). Two tones, the title row a little lighter than the controls
// row, read as a sheen; square ends where images can't be drawn, smooth
// half-disc image ends in kitty. The capsule paints its own background, so
// its text colors are fixed, not theme keys.
const GLOSS = {
  rows: ['#7A695B', '#68584B'],
  title: '#F6F1EC',
  artist: '#CBBFB4',
  main: '#F1EBE5',
  quiet: '#C4B8AD',
  hover: '#FFFFFF',
  played: '#F6F1EC',
  track: '#4B3F35',
}

// Without truecolor (COLORTERM unset, as in a default WSL shell) Claude Code
// rounds every color into the xterm 256-color cube, which turns the browns
// into grey and olive (seen in the user's screenshot). This palette uses only
// exact grayscale-ramp entries, so nothing shifts: a graphite gloss.
const GLOSS_256 = {
  rows: ['#585858', '#444444'],
  title: '#EEEEEE',
  artist: '#BCBCBC',
  main: '#E4E4E4',
  quiet: '#A8A8A8',
  hover: '#FFFFFF',
  played: '#EEEEEE',
  track: '#262626',
}

async function hasTruecolor($: EngineInterface) {
  const colorterm = await $.env.get('COLORTERM')
  return colorterm === 'truecolor' || colorterm === '24bit'
}

// `plain` is Minimal with no colors at all (NO_COLOR): bold and underline only.
async function drawMinimal($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], columns: number, mode: 'glossy' | 'minimal' | 'plain') {
  const gloss = mode === 'glossy'
  const { Box, Button, Text, Client, Image } = $.ui.resolve(e as never) as any
  const p = await read($, player)
  const now = await $.clock.now()
  const pos = positionAt(p, now)
  const track = TRACKS[p.track]!
  const images = e.surface === 'terminal' && (await canShowImages($))
  const G = (await hasTruecolor($)) ? GLOSS : GLOSS_256
  const bg: (string | undefined)[] = gloss ? G.rows : [undefined, undefined]
  const none = undefined as string | undefined
  const ink = gloss
    ? { title: G.title, artist: G.artist, main: G.main, quiet: G.quiet, hover: G.hover, played: G.played, track: G.track, time: G.artist }
    : mode === 'minimal'
      ? { title: 'text', artist: 'inactive', main: 'text', quiet: 'inactive', hover: 'text', played: 'text', track: 'subtle', time: 'inactive' }
      : { title: none, artist: none, main: none, quiet: none, hover: none, played: none, track: none, time: none }

  // Widths: controls 10, gap 3, seek S + time 7, gap 3, icons 10, cover 2+2;
  // glossy adds 2 cells of padding inside each end (and a 2-cell image cap in kitty).
  const pad = gloss ? 2 : 0
  const cap = gloss && images ? 2 : 0
  const room = columns - 2 - 2 * (pad + cap)
  const cover = images ? 4 : 0
  const hasIcons = room >= 10 + 3 + 8 + 7 + 3 + 10 + cover
  const fixed = 10 + 3 + 7 + (hasIcons ? 3 + 10 : 0) + cover
  const S = Math.max(8, Math.min(24, room - fixed))
  const width = fixed + S

  const control = (k: string, label: string, look: { color?: string; bold?: boolean; underline?: boolean }, run: () => Promise<void>) => (
    <Box key={`${k}-hover`}>
      <Button key={k} plain onPress={run}>
        <Text {...look} backgroundColor={bg[1]} hover={ink.hover === undefined ? { inverse: true } : { color: ink.hover, bold: true }}>
          {label}
        </Text>
      </Button>
    </Box>
  )
  const space = (n: number, row: number) => <Text backgroundColor={bg[row]}>{' '.repeat(Math.max(0, n))}</Text>
  const main = { color: ink.main }
  const quiet = { color: ink.quiet }
  const on = ink.hover === undefined ? { bold: true, underline: true } : { color: ink.hover, bold: true, underline: true }
  const volumeGlyph = p.volume === 0 ? '◁× ' : p.volume < 0.5 ? '◁) ' : '◁))'
  const title = fit(track.title, Math.max(4, width - cover - 3 - track.artist.length)).trimEnd()
  const rest = ` · ${track.artist}`
  const lead = width - cover - cells(title) - cells(rest)
  const capImage = (side: 'l' | 'r') =>
    cap > 0 && (
      <Image key={`cap-${side}`} source={{ rgba: capPixels(side, G.rows, cap), width: cap * CELL_W, height: 2 * CELL_H }} columns={cap} rows={2} alt=" " />
    )
  const padColumn = (key: string) =>
    pad > 0 && (
      <Box key={key} flexDirection="column">
        {space(pad, 0)}
        {space(pad, 1)}
      </Box>
    )

  return (
    <Box flexDirection="row" width="100%" justifyContent="flex-end">
      {capImage('l')}
      {padColumn('pad-l')}
      <Box flexDirection="column" width={width}>
        <Box flexDirection="row">
          {space(lead, 0)}
          <Text color={ink.title} backgroundColor={bg[0]} bold>
            {title}
          </Text>
          <Text color={ink.artist} backgroundColor={bg[0]}>
            {rest}
          </Text>
          {images && space(4, 0)}
        </Box>
        <Box flexDirection="row">
          {control('prev', '◀◀', main, () => act($, 'press previous', q => goTo(q, q.track - 1)))}
          {space(2, 1)}
          {control('play', p.isPlaying ? '❚❚' : ' ▶', main, () =>
            act($, p.isPlaying ? 'press pause' : 'press play', q => ({ ...q, isPlaying: !q.isPlaying })),
          )}
          {space(2, 1)}
          {control('next', '▶▶', main, () => act($, 'press next', q => goTo(q, q.track + 1)))}
          {space(3, 1)}
          <Client
            key="seek"
            module="./slider.tsx"
            props={{
              kind: 'seek',
              bar: S,
              fraction: pos / p.durationMs,
              remainingMs: p.durationMs - pos,
              isPlaying: p.isPlaying,
              durationMs: p.durationMs,
              // Client props may not hold undefined: JSON drops the unset colors.
              look: JSON.parse(JSON.stringify({
                prefix: '', prefixCells: 0, suffix: '',
                fill: '━', knob: '', rest: '─', partial: '╸',
                fillColors: ink.played === undefined ? [] : [ink.played],
                restColor: ink.track, timeColor: ink.time, bg: bg[1],
              })),
            }}
          />
          {hasIcons && space(3, 1)}
          {hasIcons &&
            control('shuffle', '⇄', p.isShuffle ? on : quiet, () =>
              act($, 'press shuffle', q => ({ ...q, isShuffle: !q.isShuffle })),
            )}
          {hasIcons && space(2, 1)}
          {hasIcons &&
            control('volume', volumeGlyph, quiet, () =>
              act($, 'press volume (mute)', q =>
                q.volume === 0 ? { ...q, volume: q.mutedFrom ?? 0.6 } : { ...q, mutedFrom: q.volume, volume: 0 },
              ),
            )}
          {hasIcons && space(2, 1)}
          {hasIcons &&
            control('repeat', p.repeat === 'track' ? '↻¹' : '↻ ', p.repeat === 'off' ? quiet : on, () =>
              act($, 'press repeat', q => ({ ...q, repeat: q.repeat === 'off' ? 'context' : q.repeat === 'context' ? 'track' : 'off' })),
            )}
          {images && space(2, 1)}
          {images && (
            <Image key="cover" source={{ rgba: coverPixels(p.track, 2, 1, bg[1] ?? null), width: 2 * CELL_W, height: CELL_H }} columns={2} rows={1} alt=" " />
          )}
        </Box>
      </Box>
      {padColumn('pad-r')}
      {capImage('r')}
    </Box>
  )
}

async function drawGlass($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], columns: number) {
  const { Box, Button, Text, Client, Image } = $.ui.resolve(e as never) as any
  const p = await read($, player)
  const now = await $.clock.now()
  const pos = positionAt(p, now)
  const track = TRACKS[p.track]!
  const images = e.surface === 'terminal' && (await canShowImages($))
  // Without images (Windows Terminal, tmux) the capsule is flat and square:
  // one color per surface, no stair-stepped caps, no banded gradient, and a
  // solid Cover swatch instead of a coarse mosaic. Crisp beats fake-smooth.
  const truecolor = await hasTruecolor($)
  const GL = truecolor ? GLASS : GLASS_256
  const R = images ? GL.rows : [GL.flat, GL.flat, GL.flat]
  const CAP = images ? 3 : 0 // a smooth half disc needs ~3 cells across

  // Widths: caps CAP+CAP, padding 2+2, Controls 10, gaps 3+3, card 7+T, icons 10.
  const extra = 2 * (CAP - 1)
  const hasIcons = columns - 2 >= 38 + 10 + 12 + extra
  const fixed = (hasIcons ? 38 + 3 : 38 - 10 - 3 + 3) + extra
  const T = Math.max(6, Math.min(30, columns - 2 - fixed))

  const blank = (key: string, width: number) => (
    <Box key={key} flexDirection="column">
      {[0, 1, 2].map(r => (
        <Text backgroundColor={R[r]}>{' '.repeat(width)}</Text>
      ))}
    </Box>
  )
  const control = (k: string, label: string, ink: { color: string; bold?: boolean; underline?: boolean }, run: () => Promise<void>) => (
    <Box key={`${k}-hover`}>
      <Button key={k} plain onPress={run}>
        <Text {...ink} backgroundColor={R[1]} hover={{ color: GL.hover, bold: true }}>
          {label}
        </Text>
      </Button>
    </Box>
  )
  const gap = (n: number) => <Text backgroundColor={R[1]}>{' '.repeat(n)}</Text>
  const middleRow = (key: string, width: number, children: unknown) => (
    <Box key={key} flexDirection="column">
      <Text backgroundColor={R[0]}>{' '.repeat(width)}</Text>
      <Box flexDirection="row">{children}</Box>
      <Text backgroundColor={R[2]}>{' '.repeat(width)}</Text>
    </Box>
  )
  const idle = { color: GL.icon }
  const on = { color: GL.hover, bold: true, underline: true }
  const volumeGlyph = p.volume === 0 ? '◁× ' : p.volume < 0.5 ? '◁) ' : '◁))'
  const C = images ? GL.card : [GL.flatCard, GL.flatCard, GL.flatCard]

  return (
    <Box flexDirection="row" width="100%" justifyContent="flex-end">
      <Box flexDirection="row">
        {images ? (
          <Image key="cap-l" source={{ rgba: capPixels('l', R, CAP), width: CAP * CELL_W, height: 3 * CELL_H }} columns={CAP} rows={3} alt=" " />
        ) : null}
        {blank('pad-l', 2)}
        {middleRow('controls', 10, [
          control('prev', '◀◀', idle, () => act($, 'press previous', q => goTo(q, q.track - 1))),
          gap(2),
          control('play', p.isPlaying ? '❚❚' : ' ▶', idle, () =>
            act($, p.isPlaying ? 'press pause' : 'press play', q => ({ ...q, isPlaying: !q.isPlaying })),
          ),
          gap(2),
          control('next', '▶▶', idle, () => act($, 'press next', q => goTo(q, q.track + 1))),
        ])}
        {blank('gap-1', 3)}
        <Box key="card" flexDirection="column">
          <Box flexDirection="row">
            <Box flexDirection="column">
              <Text backgroundColor={C[0]}> </Text>
              <Text backgroundColor={C[1]}> </Text>
            </Box>
            {images ? (
              <Image key="cover" source={{ rgba: coverPixels(p.track, 4, 2, C[0]!), width: 4 * CELL_W, height: 2 * CELL_H }} columns={4} rows={2} alt=" " />
            ) : (
              <Box key="cover" flexDirection="column">
                <Text backgroundColor={(truecolor ? swatch(p.track) : '#6C6C6C')}>{'    '}</Text>
                <Text backgroundColor={(truecolor ? swatch(p.track) : '#6C6C6C')}>{'    '}</Text>
              </Box>
            )}
            <Box flexDirection="column">
              <Text backgroundColor={C[0]} color={GL.title} bold>
                {' ' + fit(track.title, T) + ' '}
              </Text>
              <Text backgroundColor={C[1]} color={GL.artist}>
                {' ' + fit(track.artist, T) + ' '}
              </Text>
            </Box>
          </Box>
          <Box flexDirection="row">
            <Text backgroundColor={C[2]}> </Text>
            <Client
              key="seek"
              module="./slider.tsx"
              props={{
                kind: 'seek',
                bar: 5 + T,
                fraction: pos / p.durationMs,
                remainingMs: p.durationMs - pos,
                isPlaying: p.isPlaying,
                durationMs: p.durationMs,
                look: {
                  prefix: '', prefixCells: 0, suffix: '',
                  fill: '▁', knob: '', rest: '▁',
                  fillColors: [GL.played], restColor: GL.unplayed, bg: C[2], hideTime: true,
                },
              }}
            />
            <Text backgroundColor={C[2]}> </Text>
          </Box>
        </Box>
        {blank('gap-2', 3)}
        {hasIcons &&
          middleRow('icons', 10, [
            control('shuffle', '⇄', p.isShuffle ? on : idle, () =>
              act($, 'press shuffle', q => ({ ...q, isShuffle: !q.isShuffle })),
            ),
            gap(2),
            control('volume', volumeGlyph, idle, () =>
              act($, 'press volume (mute)', q =>
                q.volume === 0 ? { ...q, volume: q.mutedFrom ?? 0.6 } : { ...q, mutedFrom: q.volume, volume: 0 },
              ),
            ),
            gap(2),
            control('repeat', p.repeat === 'track' ? '↻¹' : '↻ ', p.repeat === 'off' ? idle : on, () =>
              act($, 'press repeat', q => ({ ...q, repeat: q.repeat === 'off' ? 'context' : q.repeat === 'context' ? 'track' : 'off' })),
            ),
          ])}
        {blank('pad-r', 2)}
        {images ? (
          <Image key="cap-r" source={{ rgba: capPixels('r', R, CAP), width: CAP * CELL_W, height: 3 * CELL_H }} columns={CAP} rows={3} alt=" " />
        ) : null}
      </Box>
    </Box>
  )
}

async function drawBar($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], columns: number) {
  // NO_COLOR gives Minimal with no colors at all (tui-design review, fix 6).
  const noColor = await $.env.get('NO_COLOR')
  if (noColor !== undefined && noColor !== '') return drawMinimal($, e, columns, 'plain')
  const chosen = await read($, look)
  if (chosen === 'glass') return drawGlass($, e, columns)
  return drawMinimal($, e, columns, chosen === 'minimal' ? 'minimal' : 'glossy')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hum-proto',
      description: 'PROTOTYPE: switch Bar placement; `/hum-proto style` cycles the look',
    })
    const now = await $.clock.now()
    await update($, player, p => ({ ...p, anchoredAt: now }))
    // Fake "poll": advance to the next track when one ends.
    $.clock.every(1000, async () => {
      const t = await $.clock.now()
      const p = await read($, player)
      if (p.isPlaying && positionAt(p, t) >= p.durationMs) {
        await update($, player, q => ({ ...goTo(q, q.repeat === 'track' ? q.track : q.track + 1), anchoredAt: t }))
      }
    })
    return next(e)
  })

  on('command.run', { command: 'hum-proto' }, async ($, e) => {
    if ((e.args ?? '').trim() === 'style') {
      const now = await read($, look)
      const to = BAR_LOOKS[(BAR_LOOKS.indexOf(now) + 1) % BAR_LOOKS.length]!
      await update($, look, () => to)
      return { text: `hum-proto look: ${LOOK_NAMES[to]}` }
    }
    const next = (await read($, placement)) === 'hint' ? 'band' : 'hint'
    await update($, placement, () => next)
    return { text: `hum-proto Bar now ${next === 'hint' ? 'under the prompt' : 'above the prompt'}.` }
  })

  on('ui.message', async ($, e, next) => {
    const d = e.data as { kind: 'seek'; phase: string; x: number; fraction: number }
    if (d.kind === 'seek' && d.phase === 'up') {
      await act($, `seek x=${d.x} → ${Math.round(d.fraction * 100)}%`, p => ({
        ...p,
        positionMs: Math.round(d.fraction * p.durationMs),
      }))
    }
    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if ((await read($, placement)) !== 'hint') return next(e)
    return drawBar($, e as never, e.viewport?.columns ?? 80)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, placement)) !== 'band') return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const bar = await drawBar($, e as never, e.props.bodyColumns)
    return (
      <Box flexDirection="column">
        {bar}
        <Text dimColor>last: {await read($, lastEvent)}</Text>
      </Box>
    )
  })
}
