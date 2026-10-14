// The Spotify Web API, as pure functions: which request each Command is, and
// what a `GET /v1/me/player` answer means for the Bar. register.tsx sends the
// requests (through $.http.fetch, or Demo mode).
// Reference: https://developer.spotify.com/documentation/web-api (Player, Playlists).
import type { NowPlaying, Page, PlaylistRow, TrackRow } from '../types'
import { DEFAULT_VOLUME, HINT_AD, idle, nextRepeat, stopped } from './player'
import type { Command, Playing } from './player'

export const API = 'https://api.spotify.com/v1'

/** Spotify's answer to one request; null where hum sent nothing (logged out, a free account, a back-off). */
export type Reply = { status: number; text: string }

/** One Web API request, before it becomes a URL; `body` is sent as JSON. */
export type ApiCall = { method: 'GET' | 'PUT' | 'POST'; path: string; query?: Record<string, string>; body?: unknown }

// Without additional_types=episode, Spotify sends no item for a podcast episode.
export const GET_PLAYER: ApiCall = { method: 'GET', path: '/me/player', query: { additional_types: 'episode' } }

export const urlOf = (call: ApiCall) => {
  const query = Object.entries(call.query ?? {})
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  return `${API}${call.path}${query === '' ? '' : `?${query}`}`
}

/** The volume (0 to 1) the speaker click sets: 0, or back to the volume from before. */
export const muteTarget = (np: Playing, mutedFrom: number | null) => (np.volume === 0 ? (mutedFrom ?? DEFAULT_VOLUME) : 0)

/** The request for a click, given Now playing and the volume to restore on unmute. */
export function callFor(cmd: Command, np: Playing, mutedFrom: number | null): ApiCall {
  switch (cmd.type) {
    case 'toggle':
      return { method: 'PUT', path: np.isPlaying ? '/me/player/pause' : '/me/player/play' }
    case 'next':
      return { method: 'POST', path: '/me/player/next' }
    case 'previous':
      return { method: 'POST', path: '/me/player/previous' }
    case 'seek': {
      const ms = Math.round(Math.max(0, Math.min(1, cmd.fraction)) * np.track.durationMs)
      return { method: 'PUT', path: '/me/player/seek', query: { position_ms: String(ms) } }
    }
    case 'mute': {
      const to = muteTarget(np, mutedFrom)
      return { method: 'PUT', path: '/me/player/volume', query: { volume_percent: String(Math.round(to * 100)) } }
    }
    case 'shuffle':
      return { method: 'PUT', path: '/me/player/shuffle', query: { state: String(!np.isShuffle) } }
    case 'repeat':
      return { method: 'PUT', path: '/me/player/repeat', query: { state: nextRepeat[np.repeat] } }
  }
}

type PlayerJson = {
  currently_playing_type?: string
  is_playing?: boolean
  progress_ms?: number | null
  shuffle_state?: boolean
  repeat_state?: string
  device?: { id?: string | null; volume_percent?: number | null; supports_volume?: boolean } | null
  item?: {
    id?: string
    uri?: string
    type?: string
    name?: string
    duration_ms?: number
    /** A track's. */
    artists?: { name?: string }[]
    /** An episode's. */
    show?: { name?: string }
  } | null
}

const parseJson = <T>(status: number, text: string): T | null => {
  if (status !== 200) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

export const parseRepeat = (state: string | undefined) => (state === 'context' || state === 'track' ? state : 'off')

/**
 * Now playing from a successful `GET /v1/me/player` answer (200 or 204); `at`
 * is when it was read, `prev` what the Bar showed. With no Device (204) or
 * nothing loaded, the Bar keeps `prev`'s track, paused. Null for anything else
 * (an error, a body that isn't JSON): the caller keeps the Now playing it had.
 */
export function parsePlayer(status: number, text: string, at: number, prev: NowPlaying): NowPlaying | null {
  if (status === 204 || (status === 200 && text.trim() === '')) return stopped(prev, at, false, '')
  const json = parseJson<PlayerJson>(status, text)
  if (json === null) return null
  if (!json.device) return stopped(prev, at, false, '')
  if (json.currently_playing_type === 'ad') return idle(HINT_AD)
  const deviceId = json.device.id ?? ''
  const item = json.item
  if (!item) return stopped(prev, at, true, deviceId)
  const isEpisode = item.type === 'episode'
  return {
    kind: 'playing',
    track: {
      uri: item.uri ?? '',
      title: item.name ?? '',
      artist: isEpisode
        ? (item.show?.name ?? '')
        : (item.artists ?? []).map(a => a.name ?? '').filter(n => n !== '').join(', '),
      durationMs: item.duration_ms ?? 0,
    },
    isPlaying: json.is_playing === true,
    positionMs: json.progress_ms ?? 0,
    at,
    isShuffle: json.shuffle_state === true,
    repeat: parseRepeat(json.repeat_state),
    volume: Math.max(0, Math.min(100, json.device.volume_percent ?? 0)) / 100,
    canSetVolume: json.device.supports_volume !== false,
    hasDevice: true,
    deviceId,
  }
}

// Waking a Device when none is active (issue 09).
export const GET_DEVICES: ApiCall = { method: 'GET', path: '/me/player/devices' }

/** Transfer Playback to `deviceId` and start playing there. */
export const transferCall = (deviceId: string): ApiCall => ({ method: 'PUT', path: '/me/player', body: { device_ids: [deviceId], play: true } })

/**
 * The Device to wake from a `GET /v1/me/player/devices` answer: `lastId` if
 * Spotify still lists it, else the first that has an id and takes commands
 * (a restricted Device takes none). Null if there is none.
 */
export function pickDevice(reply: Reply | null, lastId: string): string | null {
  const json = reply === null ? null : parseJson<{ devices?: { id?: string | null; is_restricted?: boolean }[] }>(reply.status, reply.text)
  const usable = (json?.devices ?? []).flatMap(d => (typeof d.id === 'string' && d.is_restricted !== true ? [d.id] : []))
  return usable.includes(lastId) ? lastId : (usable[0] ?? null)
}

// The Playlist picker. Spotify pages lists 50 at a time at most.
const PAGE_SIZE = 50

export const GET_ME: ApiCall = { method: 'GET', path: '/me' }

export const playlistsCall = (offset: number): ApiCall => ({
  method: 'GET',
  path: '/me/playlists',
  query: { limit: String(PAGE_SIZE), offset: String(offset) },
})

// `/items`, not `/tracks`: Spotify removed the latter in February 2026.
export const itemsCall = (playlistId: string, offset: number): ApiCall => ({
  method: 'GET',
  path: `/playlists/${encodeURIComponent(playlistId)}/items`,
  // Without it Spotify sends no item for a podcast episode in the playlist.
  query: { limit: String(PAGE_SIZE), offset: String(offset), additional_types: 'episode' },
})

/** Plays the playlist from the entry at `position` (zero-based), so next and previous follow it. */
export const playCall = (playlistUri: string, position: number): ApiCall => ({
  method: 'PUT',
  path: '/me/player/play',
  body: { context_uri: playlistUri, offset: { position } },
})

type PageJson<T> = { offset?: number; next?: string | null; items?: T[] }

/** The offset of the page after `json`, or null after the last. */
const nextOffset = (json: PageJson<unknown>) =>
  typeof json.next === 'string' ? (json.offset ?? 0) + (json.items ?? []).length : null

/** `more` added after `page`: the rows so far, and where the list goes on. */
export const appendPage = <R>(page: Page<R>, more: Page<R>): Page<R> => ({ rows: [...page.rows, ...more.rows], next: more.next })

/** The user's id from `GET /v1/me`, or null. */
export const parseMe = (reply: Reply | null) => {
  const id = reply === null ? undefined : parseJson<{ id?: string }>(reply.status, reply.text)?.id
  return typeof id === 'string' ? id : null
}

type PlaylistJson = { id?: string; name?: string; uri?: string; collaborative?: boolean; owner?: { id?: string }; items?: { total?: number } }

/**
 * A page of `GET /v1/me/playlists`, keeping only the playlists `userId` owns or
 * collaborates on: Spotify shares no other playlist's items with a Developer app.
 */
export function parsePlaylists(reply: Reply | null, userId: string): Page<PlaylistRow> | null {
  const json = reply === null ? null : parseJson<PageJson<PlaylistJson | null>>(reply.status, reply.text)
  if (json === null) return null
  const rows = (json.items ?? []).flatMap(p =>
    p !== null && typeof p.id === 'string' && (p.owner?.id === userId || p.collaborative === true)
      ? [{ id: p.id, name: p.name ?? '', uri: p.uri ?? `spotify:playlist:${p.id}`, total: p.items?.total ?? 0 }]
      : [],
  )
  return { rows, next: nextOffset(json) }
}

type EntryJson = {
  is_local?: boolean
  item?: { uri?: string; name?: string; duration_ms?: number; artists?: { name?: string }[]; show?: { name?: string } } | null
}

/**
 * A page of `GET /v1/playlists/{id}/items`. An entry with no item (no longer
 * available) or a local file (Spotify can't start one remotely) gets no row;
 * each row keeps its position in the playlist.
 */
export function parseItems(reply: Reply | null): Page<TrackRow> | null {
  const json = reply === null ? null : parseJson<PageJson<EntryJson | null>>(reply.status, reply.text)
  if (json === null) return null
  const start = json.offset ?? 0
  const rows = (json.items ?? []).flatMap((e, i) => {
    const item = e?.item
    if (item === null || item === undefined || e?.is_local === true) return []
    const artist = item.artists !== undefined ? item.artists.map(a => a.name ?? '').filter(n => n !== '').join(', ') : (item.show?.name ?? '')
    return [{ position: start + i, uri: item.uri ?? '', title: item.name ?? '', artist, durationMs: item.duration_ms ?? 0 }]
  })
  return { rows, next: nextOffset(json) }
}
