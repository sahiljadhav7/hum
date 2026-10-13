// hum: a Spotify player Bar under Claude Code's prompt. This module wires
// Claude Code's events to the player and the drawing code; it is the only one
// that holds `$`. The player is the fake one (Demo mode) until issue 02.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Style } from '../types'
import { drawBar } from './bar/draw'
import type { Caps } from './bar/draw'
import { isStyle, STYLE_NAMES, STYLES } from './bar/look'
import { fakeApply, fakeNowPlaying, fakeTick, initialFake } from './player'
import type { Command } from './player'

const player = atom({ plugin: 'hum', key: 'player' } as const, initialFake())
const styleRef = { plugin: 'hum', key: 'style' } as const

/** The chosen look: this session's, else the one saved by an earlier session. */
async function chosenStyle($: EngineInterface): Promise<Style> {
  const { value } = await $.state.get(styleRef)
  if (value !== undefined) return value
  const saved = await $.store.get('style')
  return typeof saved === 'string' && isStyle(saved) ? saved : 'glossy'
}

async function runStyle($: EngineInterface, args: string) {
  const wanted = args.trim().toLowerCase()
  const choices = STYLES.map(s => STYLE_NAMES[s]).join(', ')
  if (wanted === '') return { text: `hum look: ${STYLE_NAMES[await chosenStyle($)]}. Choices: ${choices}.` }
  if (!isStyle(wanted)) return { text: `hum: no look called "${args.trim()}". Choices: ${choices}.` }
  await $.state.set(styleRef, wanted)
  await $.store.set('style', wanted)
  return { text: `hum look: ${STYLE_NAMES[wanted]}` }
}

async function send($: EngineInterface, cmd: Command) {
  const now = await $.clock.now()
  await update($, player, s => fakeApply(s, cmd, now))
}

/** Once a second: move past a finished track (the fake player's clock). */
async function tick($: EngineInterface) {
  const now = await $.clock.now()
  // Only write when a track actually ended. The step runs inside the update,
  // so a click landing at the same moment isn't overwritten.
  const current = await read($, player)
  if (fakeTick(current, now) !== current) await update($, player, s => fakeTick(s, now))
}

async function readCaps($: EngineInterface): Promise<Caps> {
  const noColor = await $.env.get('NO_COLOR')
  const colorterm = await $.env.get('COLORTERM')
  const tmux = await $.env.get('TMUX')
  const term = await $.env.get('TERM')
  const program = await $.env.get('TERM_PROGRAM')
  const kittyWindow = await $.env.get('KITTY_WINDOW_ID')
  const isKittyLike = term === 'xterm-kitty' || term === 'xterm-ghostty' || program === 'ghostty' || kittyWindow !== undefined
  return {
    noColor: noColor !== undefined && noColor !== '',
    truecolor: colorterm === 'truecolor' || colorterm === '24bit',
    // Images can't pass through tmux.
    images: isKittyLike && (tmux === undefined || tmux === ''),
  }
}

async function drawUnderPrompt($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], columns: number) {
  const el = $.ui.resolve(e as never) as Record<string, any>
  const caps = e.surface === 'terminal' ? await readCaps($) : { noColor: false, truecolor: true, images: false }
  const np = fakeNowPlaying(await read($, player))
  return drawBar(el, np, { style: await chosenStyle($), columns, now: await $.clock.now(), caps }, cmd => send($, cmd))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hum-style',
      description: 'Switch the hum Bar look: Glossy, Minimal or Glass',
      argumentHint: '[glossy|minimal|glass]',
    })
    // A player that has never run starts now, not at the epoch.
    const now = await $.clock.now()
    await update($, player, s => (s.anchoredAt === 0 ? { ...s, anchoredAt: now } : s))
    $.clock.every(1000, () => tick($))
    return next(e)
  })

  on('command.run', { command: 'hum-style' }, async ($, e) => runStyle($, e.args ?? ''))

  on('ui.render', { component: 'PromptHint' }, async ($, e) => drawUnderPrompt($, e as never, e.viewport?.columns ?? 80))

  // The Seek bar (hooks/bar/seek.tsx) posts where it was clicked.
  on('ui.message', { module: 'hooks/bar/seek.tsx' }, async ($, e, next) => {
    const fraction = (e.data as { fraction?: unknown }).fraction
    if (typeof fraction === 'number') await send($, { type: 'seek', fraction })
    return next(e)
  })
}
