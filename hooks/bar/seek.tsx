// The Seek bar, as a Client surface module: it gets raw pointer events with a
// column (click to seek) and moves on by itself once a second between polls,
// counting its own frame-clock ticks (not the wall clock, so tests can drive it).
import type { ClientModule } from 'claude-code'

import { countdown } from './look'

export type SeekProps = {
  /** Cells of the line itself. */
  cells: number
  positionMs: number
  durationMs: number
  isPlaying: boolean
  /** The line style: ━ played, ╸ half-cell end, ─ unplayed (Glossy, Minimal); ▁ throughout (Glass). */
  line: 'smooth' | 'underline'
  showTime: boolean
  played?: string
  track?: string
  time?: string
  bg?: string
}

type State = { stamp: string; isDown: boolean; tick: number }

const clamp = (n: number) => Math.max(0, Math.min(1, n))

const Seek: ClientModule<SeekProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const stamp = JSON.stringify(props)
  const state = surface.state

  if (state === undefined || state.stamp !== stamp) {
    if (state === undefined) {
      surface.every(1000, () => {
        const s = surface.state
        if (s) surface.setState({ ...s, tick: s.tick + 1 })
      })
    }
    surface.setState({ stamp, isDown: state?.isDown ?? false, tick: 0 })
  }

  // Seconds since these props arrived (a new poll resets it).
  const elapsed = props.isPlaying && state?.stamp === stamp ? state.tick * 1000 : 0
  const position = Math.min(props.durationMs, props.positionMs + elapsed)
  const fraction = props.durationMs > 0 ? clamp(position / props.durationMs) : 0

  surface.onPointer(ev => {
    const s = surface.state
    if (!s) return
    if (ev.type === 'down') surface.setState({ ...s, isDown: true })
    else if (ev.type === 'up' && s.isDown) {
      surface.setState({ ...s, isDown: false })
      // Only the line seeks; a click on the countdown beside it does nothing.
      if (ev.x >= 0 && ev.x < props.cells) surface.post({ fraction: clamp((ev.x + 0.5) / props.cells) })
    }
  })

  const halves = Math.round(fraction * props.cells * 2)
  const glyphs: { ch: string; isPlayed: boolean }[] = []
  for (let i = 0; i < props.cells; i++) {
    if (props.line === 'underline') glyphs.push({ ch: '▁', isPlayed: i * 2 + 1 <= halves })
    else if (i * 2 + 2 <= halves) glyphs.push({ ch: '━', isPlayed: true })
    else if (i * 2 + 1 === halves) glyphs.push({ ch: '╸', isPlayed: true })
    else glyphs.push({ ch: '─', isPlayed: false })
  }

  return (
    <Box flexDirection="row">
      {glyphs.map(g => (
        <Text color={g.isPlayed ? props.played : props.track} dimColor={!g.isPlayed && props.track === undefined} backgroundColor={props.bg}>
          {g.ch}
        </Text>
      ))}
      {props.showTime && (
        <Text color={props.time} dimColor={props.time === undefined} backgroundColor={props.bg}>
          {countdown(props.durationMs - position)}
        </Text>
      )}
    </Box>
  )
}

export default Seek
