// Draws the Playlist picker (/hum-playlist) in its pane. Pure: register.tsx
// passes in the surface's element table, the picker's state, the pane's width
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

/** One clickable row: `main`, then `rest` dim, cut together to `width` cells. */
function row(el: El, key: string, main: string, rest: string, width: number, onPress: () => unknown) {
  const { Button, Text } = el
  const shownMain = fit(main, width)
  const shownRest = fit(rest, Math.max(0, width - cells(shownMain)))
  return (
    <Button key={key} plain onPress={onPress}>
      <Text>{shownMain}</Text>
      <Text dimColor>{shownRest}</Text>
    </Button>
  )
}

const tracksLabel = (total: number) => ` · ${total} ${total === 1 ? 'track' : 'tracks'}`

export function drawPicker(el: El, picker: Picker, width: number, act: PickerActions) {
  const { Box, Text } = el
  const open = picker.open
  const more = (next: number | null) => next !== null && row(el, 'more', 'More…', '', width, act.more)
  return (
    <Box flexDirection="column">
      {picker.note !== '' && <Text color="warning">{picker.note}</Text>}
      {open === null ? (
        <Box flexDirection="column">
          {picker.playlists.rows.length === 0 && picker.playlists.next === null && <Text dimColor>No playlists of yours yet.</Text>}
          {picker.playlists.rows.map(p => row(el, `playlist:${p.id}`, p.name, tracksLabel(p.total), width, () => act.openPlaylist(p)))}
          {more(picker.playlists.next)}
        </Box>
      ) : (
        <Box flexDirection="column">
          {row(el, 'back', '← Playlists', '', width, act.back)}
          <Text bold>{fit(open.playlist.name, width)}</Text>
          {open.tracks.rows.map(t => row(el, `track:${t.position}`, t.title, t.artist === '' ? '' : ` · ${t.artist}`, width, () => act.play(t)))}
          {more(open.tracks.next)}
        </Box>
      )}
    </Box>
  )
}
