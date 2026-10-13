// hum: a Spotify player Bar under Claude Code's prompt. This module wires
// Claude Code's events to Spotify and the drawing code; it is the only one
// that holds `$`. Requests go to the Spotify Web API through $.http.fetch, or
// to Demo mode's fake Web API (hooks/demo.ts) when it is on.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DemoPlayer, Style } from '../types'
import { drawBar } from './bar/draw'
import type { Caps } from './bar/draw'
import { isStyle, STYLE_NAMES, STYLES } from './bar/look'
import { demoAnswer, demoPlayer } from './demo'
import { HINT_LOGIN, idle } from './player'
import type { Command } from './player'
import { callFor, GET_PLAYER, muteTarget, parsePlayer, urlOf } from './spotify'
import type { ApiCall } from './spotify'

/** How often Now playing is read from Spotify. */
const POLL_MS = 4_000

const nowPlaying = atom({ plugin: 'hum', key: 'nowPlaying' } as const, idle(HINT_LOGIN))
const demo = atom({ plugin: 'hum', key: 'demo' } as const, { isOn: false, player: demoPlayer(0) as DemoPlayer })
const backoffUntil = atom({ plugin: 'hum', key: 'backoffUntil' } as const, 0)
const mutedFrom = atom({ plugin: 'hum', key: 'mutedFrom' } as const, null as number | null)
const refusedToken = atom({ plugin: 'hum', key: 'refusedToken' } as const, null as string | null)

// The latest poll; an older one that answers late doesn't overwrite it.
// (A module variable: a reload starts it over, which is harmless.)
let latestPoll = 0
const styleRef = { plugin: 'hum', key: 'style' } as const

type Reply = { status: number; text: string }

/** The access token /hum-login stored (issue 03), unless Spotify has refused it. */
async function accessToken($: EngineInterface) {
  const auth = (await $.store.get('auth')) as { accessToken?: unknown } | undefined
  const token = typeof auth?.accessToken === 'string' && auth.accessToken !== '' ? auth.accessToken : null
  return token !== null && token !== (await read($, refusedToken)) ? token : null
}

/**
 * Sends one Web API request: to Demo mode when it is on, else to Spotify.
 * Null when there is nobody to send it to (not logged in) or hum is backing
 * off after a 429.
 */
async function api($: EngineInterface, call: ApiCall): Promise<Reply | null> {
  const now = await $.clock.now()
  if ((await read($, demo)).isOn) {
    let reply: Reply = { status: 404, text: '' }
    await update($, demo, d => {
      const a = demoAnswer(d.player, call, now)
      reply = { status: a.status, text: a.body === undefined ? '' : JSON.stringify(a.body) }
      return { ...d, player: a.player }
    })
    return reply
  }
  if (now < (await read($, backoffUntil))) return null
  const token = await accessToken($)
  if (token === null) return null
  // An explicit empty body on PUT and POST: Spotify can refuse one without a length (411).
  const res = await $.http.fetch(urlOf(call), {
    method: call.method,
    headers: { Authorization: `Bearer ${token}` },
    ...(call.method === 'GET' ? {} : { body: '' }),
  })
  if (res.status === 429) {
    // Wait as long as Spotify asks before sending anything else.
    const header = Object.entries(res.headers).find(([k]) => k.toLowerCase() === 'retry-after')?.[1]
    const seconds = Number(header ?? 1)
    await update($, backoffUntil, () => now + Math.max(1, Number.isFinite(seconds) ? seconds : 1) * 1000)
  }
  if (res.status === 401) await unauthorized($, token)
  return { status: res.status, text: res.text }
}

/** Spotify refused `token`. Issue 03 refreshes it here; until then, stop sending it and ask to log in. */
async function unauthorized($: EngineInterface, token: string) {
  await update($, refusedToken, () => token)
  await update($, nowPlaying, () => idle(HINT_LOGIN))
}

/** Reads Now playing (GET /v1/me/player) into state, where the Bar draws it from. */
async function poll($: EngineInterface) {
  const isDemo = (await read($, demo)).isOn
  if (!isDemo && (await accessToken($)) === null) {
    await update($, nowPlaying, () => idle(HINT_LOGIN))
    return
  }
  const poll = ++latestPoll
  const reply = await api($, GET_PLAYER)
  if (reply === null || poll !== latestPoll) return
  const at = await $.clock.now()
  // An error (429, 401, 5xx...) keeps the Now playing hum had.
  const np = parsePlayer(reply.status, reply.text, at)
  if (np !== null) await update($, nowPlaying, () => np)
}

/** A click: send its request, then read Now playing again right away. */
async function send($: EngineInterface, cmd: Command) {
  const np = await read($, nowPlaying)
  if (np.kind !== 'playing') return
  if (cmd.type === 'mute') {
    if (!np.canSetVolume) return
    const restore = await read($, mutedFrom)
    const reply = await api($, callFor(cmd, np, restore))
    if (reply !== null && reply.status < 300) {
      await update($, mutedFrom, () => (np.volume === 0 ? null : np.volume))
      // Show the new volume now, so a second quick click starts from it.
      const volume = muteTarget(np, restore)
      await update($, nowPlaying, cur => (cur.kind === 'playing' ? { ...cur, volume } : cur))
    }
  } else {
    await api($, callFor(cmd, np, null))
  }
  await poll($)
}

async function runDemo($: EngineInterface, args: string) {
  const what = args.trim().toLowerCase()
  const now = await $.clock.now()
  if (what === '') {
    const isOn = !(await read($, demo)).isOn
    await update($, demo, d => ({ isOn, player: isOn ? demoPlayer(now) : d.player }))
    // Demo mode's volume memory is not the real Device's.
    await update($, mutedFrom, () => null)
    await poll($)
    return { text: isOn ? 'hum: Demo mode on (fake Spotify).' : 'hum: Demo mode off.' }
  }
  if (what !== 'no-device' && what !== 'no-volume')
    return { text: `hum: unknown /hum-demo option "${args.trim()}". Use /hum-demo, /hum-demo no-device or /hum-demo no-volume.` }
  const d = await read($, demo)
  const player = d.isOn ? d.player : demoPlayer(now)
  const next =
    what === 'no-device' ? { ...player, hasDevice: !player.hasDevice } : { ...player, canSetVolume: !player.canSetVolume }
  await update($, demo, () => ({ isOn: true, player: next }))
  await poll($)
  const isSimulating = what === 'no-device' ? !next.hasDevice : !next.canSetVolume
  const label = what === 'no-device' ? 'no active device' : 'volume not supported'
  return { text: `hum: Demo mode on; simulating "${label}" ${isSimulating ? 'on' : 'off'}.` }
}

/** The chosen Look: this session's, else the one saved by an earlier session. */
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
  const np = await read($, nowPlaying)
  return drawBar(el, np, { style: await chosenStyle($), columns, now: await $.clock.now(), caps }, cmd => send($, cmd))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hum-style',
      description: 'Switch the hum Bar look: Glossy, Minimal or Glass',
      argumentHint: '[glossy|minimal|glass]',
    })
    await $.command.register({
      name: 'hum-demo',
      description: 'Toggle hum Demo mode (a fake Spotify); no-device / no-volume simulate those cases',
      argumentHint: '[no-device|no-volume]',
    })
    await poll($)
    $.clock.every(POLL_MS, () => poll($))
    return next(e)
  })

  on('command.run', { command: 'hum-style' }, async ($, e) => runStyle($, e.args ?? ''))
  on('command.run', { command: 'hum-demo' }, async ($, e) => runDemo($, e.args ?? ''))

  on('ui.render', { component: 'PromptHint' }, async ($, e) => drawUnderPrompt($, e as never, e.viewport?.columns ?? 80))

  // The Seek bar (hooks/bar/seek.tsx) posts where it was clicked.
  on('ui.message', { module: 'hooks/bar/seek.tsx' }, async ($, e, next) => {
    const fraction = (e.data as { fraction?: unknown }).fraction
    if (typeof fraction === 'number') await send($, { type: 'seek', fraction })
    return next(e)
  })
}
