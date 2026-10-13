// hum's state contract: the values it keeps in `$.state`.

/** One of the Bar's looks (see DESIGN.md). */
export type Style = 'glossy' | 'minimal' | 'glass'

export type Repeat = 'off' | 'context' | 'track'

/** The fake player's state (Demo mode until the Web API backend lands). */
export type FakeState = {
  track: number
  isPlaying: boolean
  /** Position at `anchoredAt`; while playing, it advances with the clock. */
  positionMs: number
  anchoredAt: number
  isShuffle: boolean
  repeat: Repeat
  volume: number
  /** The volume to restore on unmute; null when not muted. */
  mutedFrom: number | null
  /** False simulates "no Active device" (the Idle state). */
  hasDevice: boolean
  /** False simulates a Device that doesn't allow remote volume. */
  canSetVolume: boolean
}

declare module 'claude-code' {
  interface PluginState {
    hum: { player: FakeState; style: Style }
  }
}
