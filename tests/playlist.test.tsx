// /hum-playlist: the Playlist picker, tested at its seams: the command, the
// mounted Pane acted on by key, api.spotify.com beneath the plugin, and the
// engine's ui.open / ui.close stood in for and recorded.
import { expect, test } from 'claude-code/testing'

import { bar, demo, playerBody, run, setup, spotify, startSession } from './helpers'
import type { Sent } from './helpers'

const API = 'https://api.spotify.com/v1'
const LOGGED_IN = { auth: { accessToken: 'tok-1' } }

/** A simplified playlist object, as `GET /v1/me/playlists` lists it. */
const playlist = (id: string, name: string, owner: string, total: number, collaborative = false) => ({
  collaborative,
  description: null,
  external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
  href: `${API}/playlists/${id}`,
  id,
  images: [],
  name,
  owner: { id: owner, display_name: owner, type: 'user', uri: `spotify:user:${owner}` },
  public: true,
  snapshot_id: 'snap',
  items: { href: `${API}/playlists/${id}/items`, total },
  type: 'playlist',
  uri: `spotify:playlist:${id}`,
})

/** A page of Spotify's paging object. */
const page = (path: string, items: unknown[], offset: number, total: number) => ({
  href: `${API}${path}?offset=${offset}&limit=50`,
  limit: 50,
  next: offset + items.length < total ? `${API}${path}?offset=${offset + 50}&limit=50` : null,
  offset,
  previous: offset > 0 ? `${API}${path}?offset=${offset - 50}&limit=50` : null,
  total,
  items,
})

/** A playlist entry from `GET /v1/playlists/{id}/items`; a null item is a track no longer available. */
const entry = (name: string | null, artists: string[] = []) => ({
  added_at: '2026-01-01T00:00:00Z',
  is_local: false,
  item:
    name === null
      ? null
      : { type: 'track', id: name, name, uri: `spotify:track:${name}`, duration_ms: 200_000, artists: artists.map(a => ({ name: a })) },
})

const ME = { id: 'sahil', display_name: 'Sahil', type: 'user', uri: 'spotify:user:sahil' }

const PLAYLISTS = [
  playlist('p-mine', 'Late night code', 'sahil', 3),
  playlist('p-top', "Today's Top Hits", 'spotify', 50),
  playlist('p-shared', 'Road trip', 'friend', 12, true),
]

const ITEMS = [entry('Espresso', ['Sabrina Carpenter']), entry(null), entry('Flowers', ['Miley Cyrus'])]

/** A stand-in for Spotify with the playlists above; `play` answers PUT /me/player/play. */
function account(on: any, over: { player?: () => { status: number; body?: unknown }; play?: number } = {}) {
  return spotify(on, req => {
    const url = new URL(req.url)
    const path = url.pathname.replace('/v1', '')
    if (req.method === 'GET' && path === '/me') return { status: 200, body: ME }
    if (req.method === 'GET' && path === '/me/playlists') return { status: 200, body: page(path, PLAYLISTS, 0, PLAYLISTS.length) }
    if (req.method === 'GET' && path === '/playlists/p-mine/items') return { status: 200, body: page(path, ITEMS, 0, ITEMS.length) }
    if (req.method === 'PUT' && path === '/me/player/play') return { status: over.play ?? 204 }
    if (req.method === 'GET' && path === '/me/player') return over.player?.() ?? { status: 200, body: playerBody() }
    return { status: 404 }
  })
}

/** Records the engine's pane opens and closes, answering as a surface that places the pane. */
function panes(on: any) {
  const opened: { id: string; title?: string }[] = []
  const closed: string[] = []
  on('ui.open', (_$: unknown, e: { id: string; title?: string }) => {
    opened.push({ id: e.id, title: e.title })
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$: unknown, e: { id: string }) => {
    closed.push(e.id)
    return { value: undefined }
  })
  return { opened, closed }
}

const pane = ($: any) =>
  $.ui.mount({
    plugin: 'hum',
    surface: 'terminal',
    component: 'Pane',
    requestId: 'hum-playlist',
    props: { title: 'Playlists', isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 20 }, view: {} },
    viewport: { columns: 160, rows: 40, isFullscreen: true },
  }) as Promise<any>

const rows = async (ui: any) => (await ui.findAll({ type: 'Button' })).map((b: any) => b.key as string)
const asked = (sent: Sent[]) => sent.map(r => `${r.method} ${r.url.replace(API, '')}`)

test('/hum-playlist opens a pane listing the playlists the user owns or collaborates on', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const sent = account(on)
  const { opened } = panes(on)
  await startSession($, on)
  await run($, 'hum-playlist')
  expect(opened).toEqual([{ id: 'hum-playlist', title: 'Playlists' }])
  expect(asked(sent)).toContain('GET /me/playlists?limit=50&offset=0')
  const ui = await pane($)
  expect(await rows(ui)).toEqual(['playlist:p-mine', 'playlist:p-shared'])
  expect(await ui.find({ type: 'Text', text: /Late night code/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Today's Top Hits/ })).toBeUndefined()
  await ui.unmount()
})

test('picking a playlist lists its tracks; back returns to the playlists', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const sent = account(on)
  panes(on)
  await startSession($, on)
  await run($, 'hum-playlist')
  const ui = await pane($)
  await ui.press({ key: 'playlist:p-mine' })
  expect(asked(sent)).toContain('GET /playlists/p-mine/items?limit=50&offset=0')
  // The unavailable entry has no row; each row keeps its place in the playlist.
  expect(await rows(ui)).toEqual(['back', 'track:0', 'track:2'])
  expect(await ui.find({ type: 'Text', text: /Sabrina Carpenter/ })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await rows(ui)).toEqual(['playlist:p-mine', 'playlist:p-shared'])
  await ui.unmount()
})

test('picking a track plays it within its playlist, then the pane closes', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const sent = account(on)
  const { closed } = panes(on)
  await startSession($, on)
  await run($, 'hum-playlist')
  const ui = await pane($)
  await ui.press({ key: 'playlist:p-mine' })
  await ui.press({ key: 'track:2' })
  const play = sent.find(r => r.method === 'PUT' && r.url === `${API}/me/player/play`)
  expect(play?.headers['Content-Type']).toBe('application/json')
  // As in Spotify's example: a playlist context, and a zero-based offset into it.
  expect(JSON.parse(play?.body ?? '{}')).toEqual({ context_uri: 'spotify:playlist:p-mine', offset: { position: 2 } })
  expect(closed).toEqual(['hum-playlist'])
  await ui.unmount()
})

test('a long list has a More row that loads the next 50', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const many = Array.from({ length: 60 }, (_, i) => playlist(`p${i}`, `Mix ${i}`, 'sahil', 10))
  const sent = spotify(on, req => {
    const url = new URL(req.url)
    const path = url.pathname.replace('/v1', '')
    if (path === '/me') return { status: 200, body: ME }
    if (path === '/me/playlists') {
      const offset = Number(url.searchParams.get('offset'))
      return { status: 200, body: page(path, many.slice(offset, offset + 50), offset, many.length) }
    }
    return { status: 200, body: playerBody() }
  })
  panes(on)
  await startSession($, on)
  await run($, 'hum-playlist')
  const ui = await pane($)
  expect(await rows(ui)).toHaveLength(51)
  expect((await rows(ui)).at(-1)).toBe('more')
  await ui.press({ key: 'more' })
  expect(asked(sent)).toContain('GET /me/playlists?limit=50&offset=50')
  expect(await rows(ui)).toHaveLength(60)
  expect(await ui.find({ type: 'Text', text: /Mix 59/ })).toBeDefined()
  await ui.unmount()
})

test('with no Active device the pane says so and sends no play', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const sent = account(on, { player: () => ({ status: 204 }) })
  const { closed } = panes(on)
  await startSession($, on)
  await run($, 'hum-playlist')
  const ui = await pane($)
  await ui.press({ key: 'playlist:p-mine' })
  await ui.press({ key: 'track:0' })
  expect(asked(sent)).not.toContain('PUT /me/player/play')
  expect(await ui.find({ type: 'Text', text: /no active Spotify device/i })).toBeDefined()
  expect(closed).toEqual([])
  await ui.unmount()
})

test('a play Spotify answers 404 (no device after all) says so and keeps the pane open', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  account(on, { play: 404 })
  const { closed } = panes(on)
  await startSession($, on)
  await run($, 'hum-playlist')
  const ui = await pane($)
  await ui.press({ key: 'playlist:p-mine' })
  await ui.press({ key: 'track:0' })
  expect(await ui.find({ type: 'Text', text: /no active Spotify device/i })).toBeDefined()
  expect(closed).toEqual([])
  await ui.unmount()
})

test('not logged in, /hum-playlist points to /hum-login and opens no pane', async ($, on) => {
  setup(on)
  const sent = account(on)
  const { opened } = panes(on)
  await startSession($, on)
  expect(await run($, 'hum-playlist')).toMatch(/\/hum-login/)
  expect(opened).toEqual([])
  expect(sent).toEqual([])
})

test('in Demo mode the fake playlists play in the Bar', async ($, on) => {
  setup(on)
  panes(on)
  await demo($)
  await run($, 'hum-playlist')
  const ui = await pane($)
  const playlists = await rows(ui)
  expect(playlists.length).toBeGreaterThan(0)
  await ui.press({ key: playlists[0]! })
  await ui.press({ key: 'track:1' })
  await ui.unmount()
  const barUi = await bar($)
  expect(await barUi.find({ type: 'Text', text: /Flowers/ })).toBeDefined()
  await barUi.unmount()
})

test("a playlist's tracks page too, and a track from page 2 plays at its place in the playlist", async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const long = Array.from({ length: 60 }, (_, i) => entry(`Song ${i}`, ['Band']))
  const sent = spotify(on, req => {
    const url = new URL(req.url)
    const path = url.pathname.replace('/v1', '')
    if (path === '/me') return { status: 200, body: ME }
    if (path === '/me/playlists') return { status: 200, body: page(path, [playlist('p-long', 'Long', 'sahil', 60)], 0, 1) }
    if (path === '/playlists/p-long/items') {
      const offset = Number(url.searchParams.get('offset'))
      return { status: 200, body: page(path, long.slice(offset, offset + 50), offset, long.length) }
    }
    if (path === '/me/player/play') return { status: 204 }
    return { status: 200, body: playerBody() }
  })
  panes(on)
  await startSession($, on)
  await run($, 'hum-playlist')
  const ui = await pane($)
  await ui.press({ key: 'playlist:p-long' })
  expect((await rows(ui)).at(-1)).toBe('more')
  await ui.press({ key: 'more' })
  expect(asked(sent)).toContain('GET /playlists/p-long/items?limit=50&offset=50')
  expect(await rows(ui)).toHaveLength(61) // back + 60 tracks
  await ui.press({ key: 'track:52' })
  const play = sent.find(r => r.method === 'PUT' && r.url === `${API}/me/player/play`)
  expect(JSON.parse(play?.body ?? '{}')).toEqual({ context_uri: 'spotify:playlist:p-long', offset: { position: 52 } })
  await ui.unmount()
})

test('a first page with none of the user\'s playlists offers More, not "no playlists"', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const followed = Array.from({ length: 50 }, (_, i) => playlist(`f${i}`, `Followed ${i}`, 'spotify', 10))
  spotify(on, req => {
    const path = new URL(req.url).pathname.replace('/v1', '')
    if (path === '/me') return { status: 200, body: ME }
    if (path === '/me/playlists') return { status: 200, body: page(path, followed, 0, 51) }
    return { status: 200, body: playerBody() }
  })
  panes(on)
  await startSession($, on)
  await run($, 'hum-playlist')
  const ui = await pane($)
  expect(await rows(ui)).toEqual(['more'])
  expect(await ui.find({ type: 'Text', text: /No playlists/ })).toBeUndefined()
  await ui.unmount()
})

test("a page that arrives after another playlist was opened isn't added to it", async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const long = Array.from({ length: 60 }, (_, i) => entry(`Song ${i}`, ['Band']))
  let release = () => {}
  const held = new Promise<void>(r => (release = r))
  on('http.fetch', async (_$: unknown, e: { url: string }) => {
    const url = new URL(e.url)
    const path = url.pathname.replace('/v1', '')
    const offset = Number(url.searchParams.get('offset'))
    const reply = (body: unknown) => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(body) } })
    if (path === '/me') return reply(ME)
    if (path === '/me/playlists') return reply(page(path, [playlist('p-a', 'A', 'sahil', 60), playlist('p-b', 'B', 'sahil', 1)], 0, 2))
    if (path === '/playlists/p-a/items') {
      if (offset === 50) await held // A's second page is slow
      return reply(page(path, long.slice(offset, offset + 50), offset, long.length))
    }
    if (path === '/playlists/p-b/items') return reply(page(path, [entry('Only song', ['Solo'])], 0, 1))
    return reply(playerBody())
  })
  panes(on)
  await startSession($, on)
  await run($, 'hum-playlist')
  const ui = await pane($)
  await ui.press({ key: 'playlist:p-a' })
  const more = ui.press({ key: 'more' })
  await ui.press({ key: 'back' })
  await ui.press({ key: 'playlist:p-b' })
  release()
  await more
  expect(await rows(ui)).toEqual(['back', 'track:0'])
  expect(await ui.find({ type: 'Text', text: /Song 5\d/ })).toBeUndefined()
  await ui.unmount()
})
