// Draws the Playlist picker (/hum-playlist) in its pane, after shadcn's Card
// and Table: a title, a dim description and a rule, then the rows. The pane's
// own frame is the card's border. Pure: register.tsx passes in the surface's
// element table, the picker's state, the pane's width, the track playing now
// and what each row does, so `$` never leaves register.tsx.
import type { Picker, PlaylistRow, TrackRow } from '../types'
import { cells, fit } from './bar/look'

export type PickerActions = {
  openPlaylist: (playlist: PlaylistRow) => unknown
  back: () => unknown
  more: () => unknown
  play: (track: TrackRow) => unknown
}

// Element constructors from `$.ui.resolve(e)`; their prop types vary per surface.
type El = Record<string, any>

const TIME_CELLS = 5 // up to 99:59
const GAP = '  '

/** `text` cut or padded to exactly `width` cells. */
const pad = (text: string, width: number) => {
  const shown = fit(text, width)
  return shown + ' '.repeat(Math.max(0, width - cells(shown)))
}

const tracksLabel = (total: number) => `${total} ${total === 1 ? 'track' : 'tracks'}`

/** A duration as m:ss. */
const time = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The card's head: a bold title, a dim line under it, the note if any, and a rule. */
function head(el: El, title: string, description: string, note: string, width: number) {
  const { Text } = el
  return [
    <Text bold>{fit(title, width)}</Text>,
    <Text dimColor>{fit(description, width)}</Text>,
    note !== '' && <Text color="warning">{note}</Text>,
    <Text dimColor>{'─'.repeat(width)}</Text>,
  ]
}

function playlists(el: El, picker: Picker, width: number, act: PickerActions) {
  const { Box, Button, Text } = el
  const { rows, next } = picker.playlists
  const total = rows.reduce((sum, p) => sum + p.total, 0)
  const description = `${rows.length}${next === null ? '' : '+'} of yours · ${tracksLabel(total)}`
  return (
    <Box flexDirection="column">
      {head(el, 'Playlists', description, picker.note, width)}
      {rows.length === 0 && next === null && <Text dimColor>No playlists of yours yet.</Text>}
      {rows.map(p => {
        const right = `${tracksLabel(p.total)} ›`
        return (
          <Button key={`playlist:${p.id}`} plain onPress={() => act.openPlaylist(p)}>
            <Text>{pad(p.name, Math.max(1, width - cells(right) - 1)) + ' '}</Text>
            <Text dimColor>{right}</Text>
          </Button>
        )
      })}
      {next !== null && <Button key="more" plain label="More…" onPress={act.more} />}
    </Box>
  )
}

function tracks(el: El, picker: Picker, open: NonNullable<Picker['open']>, width: number, playingUri: string, act: PickerActions) {
  const { Box, Button, Text } = el
  const { rows, next } = open.tracks
  // # is the place in the playlist, one cell before it for the ♪.
  const numCells = 1 + String(rows.reduce((most, t) => Math.max(most, t.position + 1), 1)).length
  const rest = Math.max(8, width - numCells - 3 * GAP.length - TIME_CELLS)
  const titleCells = Math.ceil(rest * 0.55)
  const artistCells = rest - titleCells
  const header = `${'#'.padStart(numCells)}${GAP}${pad('Title', titleCells)}${GAP}${pad('Artist', artistCells)}${GAP}${'Time'.padStart(TIME_CELLS)}`
  return (
    <Box flexDirection="column">
      <Button key="back" plain dimColor label="‹ Playlists" onPress={act.back} />
      {head(el, open.playlist.name, tracksLabel(open.playlist.total), picker.note, width)}
      <Text dimColor>{header}</Text>
      {rows.map(t => {
        const isPlaying = playingUri !== '' && t.uri === playingUri
        const duration = time(t.durationMs)
        return (
          <Button key={`track:${t.position}`} plain onPress={() => act.play(t)}>
            <Text color={isPlaying ? 'success' : undefined} dimColor={!isPlaying}>
              {(isPlaying ? '♪' : ' ') + String(t.position + 1).padStart(numCells - 1)}
            </Text>
            <Text bold={isPlaying}>{GAP + pad(t.title, titleCells)}</Text>
            <Text dimColor>{GAP + pad(t.artist, artistCells) + GAP + ' '.repeat(Math.max(0, TIME_CELLS - cells(duration)))}</Text>
            <Text dimColor>{duration}</Text>
          </Button>
        )
      })}
      {next !== null && <Button key="more" plain label="More…" onPress={act.more} />}
    </Box>
  )
}

export function drawPicker(el: El, picker: Picker, width: number, playingUri: string, act: PickerActions) {
  return picker.open === null ? playlists(el, picker, width, act) : tracks(el, picker, picker.open, width, playingUri, act)
}
