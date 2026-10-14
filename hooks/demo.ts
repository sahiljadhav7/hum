// Demo mode: a fake Spotify Web API inside hum. It answers the same requests
// the real client sends (hooks/spotify.ts), in Spotify's own JSON shape, so
// the real client and parser run end to end without an account. Pure.
import type { DemoPlayer, Track } from '../types'
import { parseRepeat } from './spotify'
import type { ApiCall } from './spotify'

export const DEMO_TRACKS: Track[] = [
  { uri: 'spotify:track:demo-0', title: 'Muddy Feet (feat Sia)', artist: 'Miley Cyrus, Sia', durationMs: 229_000 },
  { uri: 'spotify:track:demo-1', title: 'Flowers', artist: 'Miley Cyrus', durationMs: 200_000 },
  { uri: 'spotify:track:demo-2', title: 'Midnight City', artist: 'M83', durationMs: 243_000 },
]

const DEMO_USER = 'hum-demo'
const DEMO_MIX = 'demo-mix'

/** Demo mode's playlists, as `GET /v1/me/playlists` lists them: the fake player's tracks, and one the user only follows. */
const demoPlaylists = () =>
  [
    { id: DEMO_MIX, name: 'hum demo mix', owner: DEMO_USER, total: DEMO_TRACKS.length },
    { id: 'demo-top', name: 'Top 50', owner: 'spotify', total: 50 },
  ].map(p => ({
    collaborative: false,
    id: p.id,
    name: p.name,
    owner: { id: p.owner, display_name: p.owner, type: 'user', uri: `spotify:user:${p.owner}` },
    items: { href: '', total: p.total },
    type: 'playlist',
    uri: `spotify:playlist:${p.id}`,
  }))

const onePage = (items: unknown[]) => ({ limit: 50, offset: 0, next: null, previous: null, total: items.length, items })

/** Within this much of a track's start, Previous goes back a track; later, it restarts it (as Spotify does). */
const RESTART_MS = 3_000

export const demoPlayer = (now: number): DemoPlayer => ({
  track: 0,
  isPlaying: true,
  positionMs: 0,
  anchoredAt: now,
  isShuffle: false,
  repeat: 'off',
  volumePercent: 60,
  hasDevice: true,
  canSetVolume: true,
})

const durationOf = (p: DemoPlayer) => DEMO_TRACKS[p.track]!.durationMs
const positionOf = (p: DemoPlayer, now: number) =>
  Math.max(0, Math.min(durationOf(p), p.positionMs + (p.isPlaying ? now - p.anchoredAt : 0)))

const goTo = (p: DemoPlayer, track: number, now: number): DemoPlayer => ({
  ...p,
  track: ((track % DEMO_TRACKS.length) + DEMO_TRACKS.length) % DEMO_TRACKS.length,
  positionMs: 0,
  anchoredAt: now,
})

const step = (p: DemoPlayer, direction: 1 | -1) =>
  p.isShuffle && DEMO_TRACKS.length > 2
    ? p.track + direction * (1 + ((p.track * 7 + 3) % (DEMO_TRACKS.length - 1)))
    : p.track + direction

/** Moves past a finished track: the next one, the same one (repeat one), or a stop after the last. */
function advance(p: DemoPlayer, now: number): DemoPlayer {
  if (!p.isPlaying || positionOf(p, now) < durationOf(p)) return p
  if (p.repeat === 'track') return goTo(p, p.track, now)
  const isLast = !p.isShuffle && p.track === DEMO_TRACKS.length - 1
  if (isLast && p.repeat === 'off') return { ...p, isPlaying: false, positionMs: durationOf(p), anchoredAt: now }
  return goTo(p, step(p, 1), now)
}

/** `/hum-demo no-device`: Spotify drops the Device, and playback stops where it was. */
export const dropDevice = (p: DemoPlayer, now: number): DemoPlayer => ({ ...p, hasDevice: false, isPlaying: false, positionMs: positionOf(p, now), anchoredAt: now })

export type DemoAnswer = { player: DemoPlayer; status: number; body?: unknown }

/** The `GET /v1/me/player` body for the fake player, in Spotify's shape. */
const playerJson = (p: DemoPlayer, now: number) => {
  const t = DEMO_TRACKS[p.track]!
  return {
    device: { id: 'demo', is_active: true, name: 'hum demo', type: 'Computer', volume_percent: p.volumePercent, supports_volume: p.canSetVolume },
    shuffle_state: p.isShuffle,
    repeat_state: p.repeat,
    progress_ms: positionOf(p, now),
    is_playing: p.isPlaying,
    currently_playing_type: 'track',
    item: {
      id: `demo-${p.track}`,
      uri: t.uri,
      name: t.title,
      duration_ms: t.durationMs,
      artists: t.artist.split(', ').map(name => ({ name })),
      album: { id: `demo-album-${p.track}`, name: t.title, images: [] },
    },
  }
}

/** Spotify's answer to `call` at `now`, and the fake player after it. */
export function demoAnswer(player: DemoPlayer, call: ApiCall, now: number): DemoAnswer {
  const p = advance(player, now)
  // The demo Device, listed whether active or not; a transfer to it makes it active.
  if (call.method === 'GET' && call.path === '/me/player/devices')
    return { player: p, status: 200, body: { devices: [{ id: 'demo', is_active: p.hasDevice, is_private_session: false, is_restricted: false, name: 'hum demo', type: 'Computer', volume_percent: p.volumePercent, supports_volume: p.canSetVolume }] } }
  if (call.method === 'PUT' && call.path === '/me/player') {
    const body = call.body as { device_ids?: string[]; play?: boolean } | undefined
    if (body?.device_ids?.[0] !== 'demo') return { player: p, status: 404 }
    return { player: { ...p, hasDevice: true, isPlaying: body.play === true ? true : p.isPlaying, positionMs: positionOf(p, now), anchoredAt: now }, status: 204 }
  }
  // Without a Device only the player answers differently; the playlists are still there.
  if (!p.hasDevice && call.path.startsWith('/me/player')) return { player: p, status: call.method === 'GET' ? 204 : 404 }
  // Pin the position to `now`, so every change starts from the truth.
  const pinned = { ...p, positionMs: positionOf(p, now), anchoredAt: now }
  const q = call.query ?? {}
  const ok = (next: DemoPlayer): DemoAnswer => ({ player: next, status: 204 })
  switch (`${call.method} ${call.path}`) {
    case 'GET /me/player':
      return { player: p, status: 200, body: playerJson(p, now) }
    case 'GET /me':
      return { player: p, status: 200, body: { id: DEMO_USER, display_name: 'hum demo', type: 'user', uri: `spotify:user:${DEMO_USER}` } }
    case 'GET /me/playlists':
      return { player: p, status: 200, body: onePage(demoPlaylists()) }
    case `GET /playlists/${DEMO_MIX}/items`:
      return {
        player: p,
        status: 200,
        body: onePage(DEMO_TRACKS.map((t, i) => ({ is_local: false, item: { type: 'track', name: t.title, uri: t.uri, duration_ms: t.durationMs, artists: t.artist.split(', ').map(name => ({ name })) } }))),
      }
    case 'PUT /me/player/play': {
      // With a body, the Playlist picker starts the demo mix at a track; without, a resume.
      const body = call.body as { context_uri?: string; offset?: { position?: number } } | undefined
      if (body === undefined) return ok({ ...pinned, isPlaying: true })
      if (body.context_uri !== `spotify:playlist:${DEMO_MIX}`) return { player: p, status: 404 }
      return ok({ ...goTo(pinned, body.offset?.position ?? 0, now), isPlaying: true })
    }
    case 'PUT /me/player/pause':
      return ok({ ...pinned, isPlaying: false })
    case 'POST /me/player/next':
      return ok(goTo(pinned, step(pinned, 1), now))
    case 'POST /me/player/previous':
      return ok(pinned.positionMs > RESTART_MS ? { ...pinned, positionMs: 0 } : goTo(pinned, step(pinned, -1), now))
    case 'PUT /me/player/seek':
      return ok({ ...pinned, positionMs: Math.max(0, Math.min(durationOf(pinned), Number(q.position_ms ?? 0))) })
    case 'PUT /me/player/volume':
      // Spotify answers 403 VOLUME_CONTROL_DISALLOW for such a Device.
      if (!pinned.canSetVolume) return { player: pinned, status: 403 }
      return ok({ ...pinned, volumePercent: Math.max(0, Math.min(100, Number(q.volume_percent ?? pinned.volumePercent))) })
    case 'PUT /me/player/shuffle':
      return ok({ ...pinned, isShuffle: q.state === 'true' })
    case 'PUT /me/player/repeat':
      return ok({ ...pinned, repeat: parseRepeat(q.state) })
    default:
      return { player: p, status: 404 }
  }
}
