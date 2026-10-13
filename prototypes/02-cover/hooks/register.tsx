// PROTOTYPE (throwaway): hum issue 04, decoding the Cover.
// Question: can a plugin fetch a Spotify cover JPEG, decode it in pure JS
// (no Node), and draw it as an Image (kitty, Ghostty) or as a 1-row Raster of
// ▀ half-blocks elsewhere? Which fallback width, 2 or 3 cells? (User: 2.)
// Then: what should Glass's 4×2 card Cover be without images?
// /hum-cover shows the next cover; /hum-cover <i.scdn.co URL> shows that one;
// /hum-cover glass toggles the Glass card comparison.
//
// Found while building it: $.http.fetch hands back the body as UTF-8 text, so
// a JPEG arrives mangled (2822 bytes in, 2663 chars out, 1041 of them U+FFFD).
// curl's stdout through $.process.run is mangled the same way. What works is
// `curl -o <file>` then $.fs.read(file, { as: 'bytes' }).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Shown, View } from '../types'
import { decode } from './jpeg'

// Real 64 px covers (the `ab67616d00004851` size), picked for different palettes.
const COVERS = [
  { title: 'Blinding Lights', hash: '8863bc11d2aa12b54f5aeb36' },
  { title: 'bad guy', hash: '50a3147b4edd7701a876c6ce' },
  { title: 'Flowers', hash: 'f429549123dbe8552764ba1d' },
  { title: 'Mr. Brightside', hash: '9c284a6855f4945dc5a3cd73' },
  { title: 'Never Gonna Give You Up', hash: 'baf89eb11ec7c657805d2da0' },
]
const SIZE_64 = 'https://i.scdn.co/image/ab67616d00004851'
const SIZE_300 = 'https://i.scdn.co/image/ab67616d00001e02'
const TMP = '/tmp/hum-cover-proto.jpg'
// Measured on jpeg-js 0.4.4's decoder.js: raw, esbuild --minify, then gzip -9 of that.
const DECODER_SIZE = 'jpeg-js 41 KB (13 KB min, 5 KB min+gz)'
const RUNS = 50

const EMPTY: Shown = { title: '', url: '', status: 'loading…', width: 0, height: 0, rgba: '', cells2: '', cells3: '', cells4x2: '', average: '' }
const shown = atom({ plugin: 'hum-cover-proto', key: 'shown' } as const, EMPTY)
const view = atom({ plugin: 'hum-cover-proto', key: 'view' } as const, 'widths' as View)
let next = 0

const b64 = (bytes: Uint8Array) => (bytes as unknown as { toBase64(): string }).toBase64()
const fromB64 = (s: string) => (Uint8Array as unknown as { fromBase64(s: string): Uint8Array }).fromBase64(s)

async function fetchBytes($: EngineInterface, url: string) {
  const r = await $.process.run(['curl', '-sfL', '-o', TMP, url], { timeoutMs: 10_000 })
  if (r.exitCode !== 0) throw new Error(`curl exit ${r.exitCode} ${r.stderr.trim()}`)
  const { base64 } = (await $.fs.read(TMP, { as: 'bytes' })) as { base64: string }
  return fromB64(base64)
}

async function timeDecode($: EngineInterface, jpeg: Uint8Array) {
  const t0 = await $.clock.now()
  for (let i = 0; i < RUNS; i++) decode(jpeg, { useTArray: true })
  return ((await $.clock.now()) - t0) / RUNS
}

/**
 * `rows` rows of ▀ cells, `columns` wide: each cell's foreground is the top
 * sample and its background the bottom one, so the grid is columns × 2·rows
 * samples, each the box average of the pixels it covers.
 */
function halfBlocks(rgba: Uint8Array, w: number, h: number, columns: number, rows = 1) {
  const words = new Uint32Array(columns * rows * 3)
  const sample = (sx: number, sy: number) => {
    const x0 = Math.floor((sx * w) / columns), x1 = Math.floor(((sx + 1) * w) / columns)
    const y0 = Math.floor((sy * h) / (2 * rows)), y1 = Math.floor(((sy + 1) * h) / (2 * rows))
    let r = 0, g = 0, b = 0, n = 0
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4
        r += rgba[i]!; g += rgba[i + 1]!; b += rgba[i + 2]!; n++
      }
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)
  }
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < columns; c++) {
      const i = (r * columns + c) * 3
      words[i] = 0x2580
      words[i + 1] = sample(c, 2 * r)
      words[i + 2] = sample(c, 2 * r + 1)
    }
  return b64(new Uint8Array(words.buffer))
}

/** The whole cover's average color, as #RRGGBB. */
function average(rgba: Uint8Array) {
  let r = 0, g = 0, b = 0
  for (let i = 0; i < rgba.length; i += 4) {
    r += rgba[i]!; g += rgba[i + 1]!; b += rgba[i + 2]!
  }
  const n = rgba.length / 4
  return '#' + [r, g, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('')
}

async function show($: EngineInterface, title: string, url: string) {
  await update($, shown, () => ({ ...EMPTY, title, url, status: `fetching ${url}` }))
  try {
    const t0 = await $.clock.now()
    const jpeg = await fetchBytes($, url)
    const fetchMs = (await $.clock.now()) - t0
    const img = decode(jpeg, { useTArray: true }) as { width: number; height: number; data: Uint8Array }
    const ms64 = await timeDecode($, jpeg)
    let big = ''
    if (url.startsWith(SIZE_64)) {
      const jpeg300 = await fetchBytes($, SIZE_300 + url.slice(SIZE_64.length))
      big = ` · 300px ${(jpeg300.length / 1024).toFixed(0)} KB decodes in ${(await timeDecode($, jpeg300)).toFixed(1)} ms`
    }
    const colorterm = (await $.env.get('COLORTERM')) ?? 'unset'
    await update($, shown, () => ({
      title,
      url,
      status: `${jpeg.length} B ${img.width}×${img.height} via curl in ${fetchMs} ms · decode ${ms64.toFixed(2)} ms${big} · ${DECODER_SIZE} · COLORTERM=${colorterm}`,
      width: img.width,
      height: img.height,
      rgba: b64(img.data),
      cells2: halfBlocks(img.data, img.width, img.height, 2),
      cells3: halfBlocks(img.data, img.width, img.height, 3),
      cells4x2: halfBlocks(img.data, img.width, img.height, 4, 2),
      average: average(img.data),
    }))
  } catch (err) {
    await update($, shown, s => ({ ...s, status: `failed: ${String(err)}` }))
  }
}

async function showNext($: EngineInterface) {
  const c = COVERS[next++ % COVERS.length]!
  await show($, c.title, SIZE_64 + c.hash)
}

export const register: Register = on => {
  on('session.start', async ($, e, nextHook) => {
    await $.command.register({
      name: 'hum-cover',
      description: 'PROTOTYPE: show the next Spotify Cover (or the one at a given URL)',
      argumentHint: '[cover URL]',
    })
    void showNext($)
    return nextHook(e)
  })

  on('command.run', { command: 'hum-cover' }, async ($, e) => {
    const url = (e.args ?? '').trim()
    if (url === 'glass') {
      const v = await update($, view, v => (v === 'glass' ? 'widths' : 'glass'))
      return { text: `hum-cover: ${v} view` }
    }
    if (url) await show($, 'custom', url)
    else await showNext($)
    const s = await read($, shown)
    return { text: `hum-cover: ${s.title}` }
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e) => {
    const el = $.ui.resolve(e as never) as Record<string, any>
    const { Box, Text } = el
    const s = await read($, shown)
    const body = s.rgba === '' ? <Text dimColor>no cover yet</Text> : (await read($, view)) === 'glass' ? await glassView($, el, s) : widthsView(el, s)
    return (
      <Box flexDirection="column">
        {body}
        <Text dimColor wrap="truncate-end">
          {s.status} · /hum-cover next · /hum-cover glass toggles the Glass view
        </Text>
      </Box>
    )
  })
}

function widthsView(el: Record<string, any>, s: Shown) {
  const { Box, Text, Raster, Image } = el
  return (
    <Box flexDirection="row" gap={1}>
      <Raster key="r2" columns={2} rows={1} cells={s.cells2} />
      <Text dimColor>2 cells</Text>
      <Text> </Text>
      <Raster key="r3" columns={3} rows={1} cells={s.cells3} />
      <Text dimColor>3 cells</Text>
      <Text> </Text>
      <Image key="img" source={{ rgba: s.rgba, width: s.width, height: s.height }} columns={2} rows={1} alt="--" />
      <Text dimColor>Image (kitty/Ghostty)</Text>
      <Text> </Text>
      <Text bold>{s.title}</Text>
    </Box>
  )
}

// Glass's card without images (hooks/bar/look.ts): flat card, title and
// artist inks, graphite without truecolor.
const CARD = {
  truecolor: { bg: '#4A3D33', title: '#F5F0EB', artist: '#B7ABA0' },
  graphite: { bg: '#3A3A3A', title: '#EEEEEE', artist: '#BCBCBC' },
}

/** Three Glass cards side by side, each with one Cover candidate. */
async function glassView($: EngineInterface, el: Record<string, any>, s: Shown) {
  const { Box, Text, Raster } = el
  const colorterm = await $.env.get('COLORTERM')
  const card = colorterm === 'truecolor' || colorterm === '24bit' ? CARD.truecolor : CARD.graphite
  const name = s.title.length > 12 ? s.title.slice(0, 11) + '…' : s.title.padEnd(12)
  const gap = (n: number) => <Text backgroundColor={card.bg}>{' '.repeat(n)}</Text>
  const text = (
    <Box flexDirection="column">
      <Text backgroundColor={card.bg} color={card.title} bold>{` ${name} `}</Text>
      <Text backgroundColor={card.bg} color={card.artist}>{` ${'Artist'.padEnd(12)} `}</Text>
    </Box>
  )
  const glassCard = (key: string, label: string, cover: unknown) => (
    <Box key={key} flexDirection="column">
      <Text dimColor>{label}</Text>
      <Box flexDirection="row">
        <Box flexDirection="column">{gap(1)}{gap(1)}</Box>
        {cover}
        {text}
      </Box>
    </Box>
  )
  return (
    <Box flexDirection="row" gap={3}>
      {glassCard('a', 'A: 4×2 half-blocks', <Raster key="g4" columns={4} rows={2} cells={s.cells4x2} />)}
      {glassCard('b', 'B: swatch (average)', (
        <Box flexDirection="column">
          <Text backgroundColor={s.average}>{'    '}</Text>
          <Text backgroundColor={s.average}>{'    '}</Text>
        </Box>
      ))}
      {glassCard('c', 'C: 2×1 like the others', (
        <Box flexDirection="column">
          <Raster key="g2" columns={2} rows={1} cells={s.cells2} />
          {gap(2)}
        </Box>
      ))}
    </Box>
  )
}
