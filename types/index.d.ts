// hum's state contract: the values it keeps in `$.state`, and the types they
// are made of. Self-contained (no imports), as the engine requires.

/** One of the Bar's Looks (see DESIGN.md). */
export type Style = 'glossy' | 'minimal' | 'glass'

export type Repeat = 'off' | 'context' | 'track'

export type Track = {
  /** Spotify's URI for it, e.g. `spotify:track:…`. */
  uri: string
  title: string
  /** The track's artists, joined with ", ". */
  artist: string
  durationMs: number
}

/** Now playing: what the Bar draws, as of the last poll. */
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
      /** 0 to 1. */
      volume: number
      /** False when the Active device doesn't allow remote volume. */
      canSetVolume: boolean
    }

/** Demo mode's fake Spotify: the state behind its Web API answers. */
export type DemoPlayer = {
  track: number
  isPlaying: boolean
  /** Position at `anchoredAt`; while playing, it advances with the clock. */
  positionMs: number
  anchoredAt: number
  isShuffle: boolean
  repeat: Repeat
  /** 0 to 100, as Spotify reports it. */
  volumePercent: number
  /** False simulates "no Active device" (`/hum-demo no-device`). */
  hasDevice: boolean
  /** False simulates a Device that doesn't allow remote volume (`/hum-demo no-volume`). */
  canSetVolume: boolean
}

/** One page of a list from the Web API: its rows, and the offset of the next page (null after the last). */
export type Page<R> = { rows: R[]; next: number | null }

/** A playlist the user owns or collaborates on, as the Playlist picker lists it. */
export type PlaylistRow = { id: string; name: string; uri: string; total: number }

/** A track in a playlist; `position` is its place in the playlist, from 0. */
export type TrackRow = { position: number; uri: string; title: string; artist: string; durationMs: number }

/** The Playlist picker (/hum-playlist): the playlists, the one opened, and a line to show above them. */
export type Picker = {
  userId: string
  playlists: Page<PlaylistRow>
  open: { playlist: PlaylistRow; tracks: Page<TrackRow> } | null
  /** Empty, or why the last pick didn't play. */
  note: string
}

declare module 'claude-code' {
  interface PluginState {
    hum: {
      /** Now playing, as of the last poll. */
      nowPlaying: NowPlaying
      /** Demo mode: on or off for this session, and its fake player. */
      demo: { isOn: boolean; player: DemoPlayer }
      /** No request to Spotify before this time (ms since epoch), after a 429. */
      backoffUntil: number
      /** The volume (0 to 1) to restore on unmute; null when not muted. */
      mutedFrom: number | null
      /** A login /hum-login started, waiting for Spotify's redirect (PKCE verifier and state). */
      pendingLogin: { clientId: string; verifier: string; state: string } | null
      /** An access token Spotify refused (401); not sent again. */
      refusedToken: string | null
      /** Spotify said the account needs Premium (403 PREMIUM_REQUIRED); nothing more is sent until the next login. */
      premiumRequired: boolean
      style: Style
      /** The Playlist picker's contents while its pane is open. */
      picker: Picker
    }
  }
}
