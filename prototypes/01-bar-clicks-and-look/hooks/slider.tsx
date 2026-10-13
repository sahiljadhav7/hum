// PROTOTYPE (throwaway): one slider (Seek bar or Volume slider) as a Client
// surface module, so it gets raw pointer down/move/up with a column.
import type { ClientModule } from 'claude-code'

export type SliderLook = {
  prefix: string // drawn before the bar ("🔊 ", "vol [")
  prefixCells: number // its width in cells, for pointer math
  suffix: string // drawn after the bar ("]")
  fill: string // one char, or '' to use `bars`
  knob: string // '' for none
  rest: string
  fillColors: string[] // one color, or a gradient spread over the filled cells
  knobColor?: string
  restColor?: string
  timeColor?: string
  bars?: string // per-cell glyphs for a bar-graph slider (volume)
  bg?: string // background behind every cell (the glass capsule)
  hideTime?: boolean // seek without the countdown
  partial?: string // half-cell end piece (e.g. '╸'): fill moves in half-cell steps, no knob
}

type Props = {
  kind: 'seek' | 'volume'
  bar: number // cells of the bar itself
  fraction: number // 0..1 at the moment the hooks module drew it
  remainingMs?: number // seek only
  isPlaying?: boolean // seek only
  durationMs?: number // seek only
  look: SliderLook
}

type State = { stamp: string; at: number; dragging: boolean; tick: number }

const clamp = (n: number) => Math.max(0, Math.min(1, n))

const time = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `-${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const lerp = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 255) + (((pb >> shift) & 255) - ((pa >> shift) & 255)) * t)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}

const Slider: ClientModule<Props, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  const look = props.look
  const stamp = JSON.stringify(props)
  const state = surface.state

  if (state === undefined || state.stamp !== stamp) {
    const first = state === undefined
    surface.setState({ stamp, at: Date.now(), dragging: state?.dragging ?? false, tick: 0 })
    if (first && props.kind === 'seek') {
      surface.every(1000, () => {
        const s = surface.state
        if (s) surface.setState({ ...s, tick: s.tick + 1 })
      })
    }
  }

  const at = state?.stamp === stamp ? state.at : Date.now()
  const elapsed = props.kind === 'seek' && props.isPlaying ? Date.now() - at : 0
  const remaining = Math.max(0, (props.remainingMs ?? 0) - elapsed)
  const fraction =
    props.kind === 'seek' && props.durationMs
      ? clamp(1 - remaining / props.durationMs)
      : clamp(props.fraction)

  surface.onPointer(ev => {
    const s = surface.state
    if (!s) return
    const f = clamp((ev.x - look.prefixCells) / Math.max(1, props.bar - 1))
    if (ev.type === 'down') {
      surface.setState({ ...s, dragging: true })
      surface.post({ kind: props.kind, phase: 'down', x: ev.x, fraction: f })
    } else if (ev.type === 'move' && s.dragging && props.kind === 'volume') {
      surface.post({ kind: props.kind, phase: 'move', x: ev.x, fraction: f })
    } else if (ev.type === 'up' && s.dragging) {
      surface.setState({ ...s, dragging: false })
      surface.post({ kind: props.kind, phase: 'up', x: ev.x, fraction: f })
    }
  })

  const cells: { ch: string; color?: string; dim?: boolean }[] = []
  const filled = look.knob ? Math.round(fraction * (props.bar - 1)) : Math.round(fraction * props.bar)
  const colors = look.fillColors
  const halves = Math.round(fraction * props.bar * 2) // for `partial`
  for (let i = 0; i < props.bar; i++) {
    if (look.partial !== undefined) {
      const ch = i * 2 + 2 <= halves ? look.fill : i * 2 + 1 === halves ? look.partial : look.rest
      cells.push(ch === look.rest ? { ch, color: look.restColor, dim: look.restColor === undefined } : { ch, color: colors[0] })
      continue
    }
    const t = props.bar > 1 ? i / (props.bar - 1) : 0
    const fillColor = colors.length > 1 && colors[0]!.startsWith('#') ? lerp(colors[0]!, colors[colors.length - 1]!, t) : colors[0]
    if (look.knob && i === filled) cells.push({ ch: look.knob, color: look.knobColor })
    else if (i < filled) cells.push({ ch: look.bars ? look.bars[i] ?? look.fill : look.fill, color: fillColor })
    else
      cells.push({
        ch: look.bars ? look.bars[i] ?? look.rest : look.rest,
        color: look.restColor,
        dim: look.restColor === undefined,
      })
  }

  return (
    <Box flexDirection="row">
      {look.prefix !== '' && <Text color={look.timeColor} backgroundColor={look.bg}>{look.prefix}</Text>}
      {cells.map(c => (
        <Text color={c.color} dimColor={c.dim} backgroundColor={look.bg}>
          {c.ch}
        </Text>
      ))}
      {look.suffix !== '' && <Text backgroundColor={look.bg}>{look.suffix}</Text>}
      {props.kind === 'seek' && !look.hideTime && <Text color={look.timeColor} backgroundColor={look.bg}>{` ${time(remaining)}`.padStart(7)}</Text>}
    </Box>
  )
}

export default Slider
