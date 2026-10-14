// The player as the Bar sees it: Now playing (types/index.d.ts) and the
// Commands a click sends. Spotify (hooks/spotify.ts) or Demo mode
// (hooks/demo.ts) answers them; register.tsx sends them.
import type { NowPlaying, Repeat, Track } from '../types'

export type Playing = Extract<NowPlaying, { kind: 'playing' }>

export type Command =
  | { type: 'toggle' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'seek'; fraction: number }
  | { type: 'mute' }
  | { type: 'shuffle' }
  | { type: 'repeat' }

export const positionAt = (np: Playing, now: number) =>
  Math.max(0, Math.min(np.track.durationMs, np.positionMs + (np.isPlaying ? now - np.at : 0)))

export const nextRepeat: Record<Repeat, Repeat> = { off: 'context', context: 'track', track: 'off' }

export const idle = (hint: string): NowPlaying => ({ kind: 'idle', hint })

export const HINT_LOGIN = 'hum: run /hum-login'
export const HINT_NO_DEVICE = 'hum: no active Spotify device'
export const HINT_AD = 'hum: ad playing'
export const HINT_PASTE = "hum: couldn't catch the login. Paste the address the browser landed on: /hum-login <address>"
export const HINT_PREMIUM = 'hum: Spotify Premium is needed to control playback'

/** The volume (0 to 1) unmute restores when hum doesn't know the one from before. */
export const DEFAULT_VOLUME = 0.5

/** The track the Bar shows before anything has played: drawn as "Nothing playing". */
export const NO_TRACK: Track = { uri: '', title: '', artist: '', durationMs: 0 }

/**
 * Now playing once playback stopped (no Device, or nothing loaded): the last
 * track paused where it was at `at`, with its Controls; or no track if none
 * played yet. `deviceId` is the Device Spotify still reports, if any.
 */
export function stopped(prev: NowPlaying, at: number, hasDevice: boolean, deviceId: string): Playing {
  if (prev.kind === 'playing')
    return { ...prev, isPlaying: false, positionMs: positionAt(prev, at), at, hasDevice, deviceId: deviceId === '' ? prev.deviceId : deviceId }
  return {
    kind: 'playing', track: NO_TRACK, isPlaying: false, positionMs: 0, at,
    isShuffle: false, repeat: 'off', volume: DEFAULT_VOLUME, canSetVolume: true, hasDevice, deviceId,
  }
}
