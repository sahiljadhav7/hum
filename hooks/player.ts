// The player as the Bar sees it: Now playing, and the commands a click sends.
// Pure functions only; register.tsx owns `$` and the stored state. The fake
// player below drives the Bar until the Web API backend (issue 02) arrives
// behind the same Command and NowPlaying types.
import type { FakeState, Repeat } from '../types'

export type Track = {
  title: string
  artist: string
  durationMs: number
  /** Placeholder art: two colors (0xRRGGBB) blended into a gradient. */
  cover: [number, number]
}

export type NowPlaying =
  | { kind: 'idle'; hint: string }
  | {
      kind: 'playing'
      track: Track
      isPlaying: boolean
      /** Position at `at` (ms since epoch); advances with the clock while playing. */
      positionMs: number
      at: number
      isShuffle: boolean
      repeat: Repeat
      volume: number
      /** False when the Active device doesn't allow remote volume. */
      canSetVolume: boolean
    }

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

const nextRepeat: Record<Repeat, Repeat> = { off: 'context', context: 'track', track: 'off' }

// Within this much of a track's start, Previous goes to the previous track;
// later, it restarts the current one (as Spotify does).
const RESTART_MS = 3_000

export const FAKE_TRACKS: Track[] = [
  { title: 'Muddy Feet (feat Sia)', artist: 'Miley Cyrus, Sia', durationMs: 229_000, cover: [0x6fa3d8, 0x1d2b3a] },
  { title: 'Flowers', artist: 'Miley Cyrus', durationMs: 200_000, cover: [0xffbe0b, 0x3a86ff] },
  { title: 'Midnight City', artist: 'M83', durationMs: 243_000, cover: [0x8338ec, 0x06d6a0] },
]

export const initialFake = (): FakeState => ({
  track: 0,
  isPlaying: true,
  positionMs: 0,
  anchoredAt: 0,
  isShuffle: false,
  repeat: 'off',
  volume: 0.6,
  mutedFrom: null,
  hasDevice: true,
  canSetVolume: true,
})

const fakePosition = (s: FakeState, now: number) =>
  Math.max(0, Math.min(FAKE_TRACKS[s.track]!.durationMs, s.positionMs + (s.isPlaying ? now - s.anchoredAt : 0)))

export const fakeNowPlaying = (s: FakeState): NowPlaying =>
  s.hasDevice
    ? {
        kind: 'playing',
        track: FAKE_TRACKS[s.track]!,
        isPlaying: s.isPlaying,
        positionMs: s.positionMs,
        at: s.anchoredAt,
        isShuffle: s.isShuffle,
        repeat: s.repeat,
        volume: s.volume,
        canSetVolume: s.canSetVolume,
      }
    : { kind: 'idle', hint: 'hum: no active Spotify device' }

const goTo = (s: FakeState, track: number, now: number): FakeState => ({
  ...s,
  track: ((track % FAKE_TRACKS.length) + FAKE_TRACKS.length) % FAKE_TRACKS.length,
  positionMs: 0,
  anchoredAt: now,
})

const step = (s: FakeState, direction: 1 | -1) =>
  s.isShuffle && FAKE_TRACKS.length > 2
    ? s.track + direction * (1 + ((s.track * 7 + 3) % (FAKE_TRACKS.length - 1)))
    : s.track + direction

export function fakeApply(state: FakeState, cmd: Command, now: number): FakeState {
  if (!state.hasDevice) return state
  // Pin the position to `now` first, so every command starts from the truth.
  const s = { ...state, positionMs: fakePosition(state, now), anchoredAt: now }
  switch (cmd.type) {
    case 'toggle':
      return { ...s, isPlaying: !s.isPlaying }
    case 'next':
      return goTo(s, step(s, 1), now)
    case 'previous':
      return s.positionMs > RESTART_MS ? { ...s, positionMs: 0 } : goTo(s, step(s, -1), now)
    case 'seek':
      return { ...s, positionMs: Math.round(Math.max(0, Math.min(1, cmd.fraction)) * FAKE_TRACKS[s.track]!.durationMs) }
    case 'mute':
      return s.volume === 0
        ? { ...s, volume: s.mutedFrom ?? 0.6, mutedFrom: null }
        : { ...s, volume: 0, mutedFrom: s.volume }
    case 'shuffle':
      return { ...s, isShuffle: !s.isShuffle }
    case 'repeat':
      return { ...s, repeat: nextRepeat[s.repeat] }
  }
}

/** Advances past a finished track; returns the same object when nothing changed. */
export function fakeTick(s: FakeState, now: number): FakeState {
  if (!s.hasDevice || !s.isPlaying || fakePosition(s, now) < FAKE_TRACKS[s.track]!.durationMs) return s
  if (s.repeat === 'track') return goTo(s, s.track, now)
  const isLast = !s.isShuffle && s.track === FAKE_TRACKS.length - 1
  if (isLast && s.repeat === 'off') return { ...s, isPlaying: false, positionMs: FAKE_TRACKS[s.track]!.durationMs, anchoredAt: now }
  return goTo(s, step(s, 1), now)
}
