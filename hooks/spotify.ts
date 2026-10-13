// The Spotify Web API, as pure functions: which request each Command is, and
// what a `GET /v1/me/player` answer means for the Bar. register.tsx sends the
// requests (through $.http.fetch, or Demo mode).
// Reference: https://developer.spotify.com/documentation/web-api (Player).
import type { NowPlaying } from '../types'
import { DEFAULT_VOLUME, HINT_AD, HINT_NO_DEVICE, HINT_NOTHING, idle, nextRepeat } from './player'
import type { Command, Playing } from './player'

export const API = 'https://api.spotify.com/v1'

/** One Web API request, before it becomes a URL. */
export type ApiCall = { method: 'GET' | 'PUT' | 'POST'; path: string; query?: Record<string, string> }

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
  device?: { volume_percent?: number | null; supports_volume?: boolean } | null
  item?: {
    id?: string
    type?: string
    name?: string
    duration_ms?: number
    /** A track's. */
    artists?: { name?: string }[]
    album?: { id?: string; images?: { url?: string }[] }
    /** An episode's. */
    show?: { name?: string }
    images?: { url?: string }[]
  } | null
}

/** Two placeholder Cover colors from a string, until the real Cover (issue 05). */
export const parseRepeat = (state: string | undefined) => (state === 'context' || state === 'track' ? state : 'off')

const placeholderCover = (seed: string): [number, number] => {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return [h & 0xffffff, (h >>> 8) & 0xffffff]
}

/**
 * Now playing from a successful `GET /v1/me/player` answer (200 or 204); `at`
 * is when it was read. Null for anything else (an error, a body that isn't
 * JSON): the caller keeps the Now playing it had.
 */
export function parsePlayer(status: number, text: string, at: number): NowPlaying | null {
  if (status === 204 || (status === 200 && text.trim() === '')) return idle(HINT_NO_DEVICE)
  if (status !== 200) return null
  let json: PlayerJson
  try {
    json = JSON.parse(text) as PlayerJson
  } catch {
    return null
  }
  if (!json.device) return idle(HINT_NO_DEVICE)
  if (json.currently_playing_type === 'ad') return idle(HINT_AD)
  const item = json.item
  if (!item) return idle(HINT_NOTHING)
  const isEpisode = item.type === 'episode'
  const coverUrl = (isEpisode ? item.images : item.album?.images)?.[0]?.url
  return {
    kind: 'playing',
    track: {
      title: item.name ?? '',
      artist: isEpisode
        ? (item.show?.name ?? '')
        : (item.artists ?? []).map(a => a.name ?? '').filter(n => n !== '').join(', '),
      durationMs: item.duration_ms ?? 0,
      cover: placeholderCover(item.album?.id ?? item.id ?? item.name ?? ''),
      ...(coverUrl === undefined ? {} : { coverUrl }),
    },
    isPlaying: json.is_playing === true,
    positionMs: json.progress_ms ?? 0,
    at,
    isShuffle: json.shuffle_state === true,
    repeat: parseRepeat(json.repeat_state),
    volume: Math.max(0, Math.min(100, json.device.volume_percent ?? 0)) / 100,
    canSetVolume: json.device.supports_volume !== false,
  }
}
