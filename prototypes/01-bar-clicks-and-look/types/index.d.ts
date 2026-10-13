export type Player = {
  track: number
  isPlaying: boolean
  isShuffle: boolean
  repeat: 'off' | 'context' | 'track'
  volume: number
  durationMs: number
  positionMs: number
  anchoredAt: number
  mutedFrom?: number
}

export type Placement = 'hint' | 'band'

declare module 'claude-code' {
  interface PluginState {
    'hum-proto': { player: Player; placement: Placement; lastEvent: string; look5: 'glossy' | 'minimal' | 'glass' }
  }
}
