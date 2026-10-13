// The player as the Bar sees it: Now playing (types/index.d.ts) and the
// Commands a click sends. Spotify (hooks/spotify.ts) or Demo mode
// (hooks/demo.ts) answers them; register.tsx sends them.
import type { NowPlaying, Repeat } from '../types'

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
export const HINT_NOTHING = 'hum: nothing playing'
export const HINT_AD = 'hum: ad playing'

/** The volume (0 to 1) unmute restores when hum doesn't know the one from before. */
export const DEFAULT_VOLUME = 0.5
