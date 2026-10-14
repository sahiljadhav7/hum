// hum: a Spotify player Bar under Claude Code's prompt. This module wires
// Claude Code's events to Spotify and the drawing code; it is the only one
// that holds `$`. Requests go to the Spotify Web API through $.http.fetch, or
// to Demo mode's fake Web API (hooks/demo.ts) when it is on.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DemoPlayer, Picker, PlaylistRow, Style, TrackRow } from '../types'
import { authorizeUrl, challengeOf, formOf, HELPER_SCRIPT, isClientId, parseRedirect, parseTokenReply, randomToken, REDIRECT_URI, SETUP_STEPS, TOKEN_URL } from './auth'
import type { Auth, PendingLogin, TokenReply } from './auth'
import { drawBar } from './bar/draw'
import type { Caps } from './bar/draw'
import { isStyle, STYLE_NAMES, STYLES } from './bar/look'
import { demoAnswer, demoPlayer, dropDevice } from './demo'
import { drawPicker } from './picker'
import { HINT_LOGIN, HINT_NO_DEVICE, HINT_PASTE, HINT_PREMIUM, idle } from './player'
import type { Command, Playing } from './player'
import { appendPage, callFor, GET_DEVICES, GET_ME, GET_PLAYER, itemsCall, muteTarget, parseItems, parseMe, parsePlayer, parsePlaylists, pickDevice, playCall, playlistsCall, transferCall, urlOf } from './spotify'
import type { ApiCall, Reply } from './spotify'

/** How often Now playing is read from Spotify. */
const POLL_MS = 4_000

const nowPlaying = atom({ plugin: 'hum', key: 'nowPlaying' } as const, idle(HINT_LOGIN))
const demo = atom({ plugin: 'hum', key: 'demo' } as const, { isOn: false, player: demoPlayer(0) as DemoPlayer })
const backoffUntil = atom({ plugin: 'hum', key: 'backoffUntil' } as const, 0)
const mutedFrom = atom({ plugin: 'hum', key: 'mutedFrom' } as const, null as number | null)
const pendingLogin = atom({ plugin: 'hum', key: 'pendingLogin' } as const, null as PendingLogin | null)
const refusedToken = atom({ plugin: 'hum', key: 'refusedToken' } as const, null as string | null)
const premiumRequired = atom({ plugin: 'hum', key: 'premiumRequired' } as const, false)
const picker = atom({ plugin: 'hum', key: 'picker' } as const, {
  userId: '',
  playlists: { rows: [], next: null },
  open: null,
  note: '',
} as Picker)

const barNote = atom({ plugin: 'hum', key: 'barNote' } as const, { text: '', until: 0 })

/** How long a note shows in the Bar in place of the title. */
const NOTE_MS = 5_000
const NOTE_OPEN_SPOTIFY = 'Open Spotify on your phone or computer, then ▶'
const NOTE_PRESS_PLAY = 'No active device: press ▶ to start one'

/** The Playlist picker's pane. */
const PICKER_PANE = 'hum-playlist'

// The latest poll; an older one that answers late doesn't overwrite it.
// (A module variable: a reload starts it over, which is harmless.)
let latestPoll = 0
// The latest playlist opened in the Playlist picker; a slower, older open doesn't overwrite it.
let latestOpen = 0

// The refresh in flight, if any: concurrent requests share it rather than each
// spending the same refresh token (which Spotify may rotate). Module variable.
let refreshing: Promise<RefreshResult> | null = null
const styleRef = { plugin: 'hum', key: 'style' } as const

/** Refresh this long before the access token expires. */
const REFRESH_EARLY_MS = 60_000

/** The login /hum-login stored, if any. */
async function storedAuth($: EngineInterface): Promise<Auth | null> {
  const auth = (await $.store.get('auth')) as Partial<Auth> | undefined
  if (typeof auth?.accessToken !== 'string' || auth.accessToken === '') return null
  return {
    clientId: auth.clientId ?? '',
    accessToken: auth.accessToken,
    refreshToken: auth.refreshToken ?? '',
    expiresAt: typeof auth.expiresAt === 'number' ? auth.expiresAt : Number.POSITIVE_INFINITY,
  }
}

type RefreshResult = { token: string } | 'refused' | 'temporary'

/**
 * Trades the refresh token for a new access token. One refresh at a time:
 * a second caller waits for the first. Never writes back over a login that
 * changed meanwhile (a new /hum-login, or /hum-logout).
 */
async function refresh($: EngineInterface, auth: Auth): Promise<RefreshResult> {
  if (refreshing !== null) return refreshing
  if (auth.refreshToken === '' || auth.clientId === '') return 'refused'
  refreshing = (async (): Promise<RefreshResult> => {
    const reply = await tokenRequest($, { grant_type: 'refresh_token', refresh_token: auth.refreshToken, client_id: auth.clientId })
    if (!reply.ok) return reply.isTemporary ? 'temporary' : 'refused'
    const current = await storedAuth($)
    if (current === null || current.refreshToken !== auth.refreshToken) return current === null ? 'refused' : { token: current.accessToken }
    // Spotify may rotate the refresh token; keep the old one when it doesn't.
    await $.store.set('auth', { ...current, accessToken: reply.accessToken, refreshToken: reply.refreshToken ?? current.refreshToken, expiresAt: reply.expiresAt })
    return { token: reply.accessToken }
  })()
  try {
    return await refreshing
  } finally {
    refreshing = null
  }
}

/**
 * A usable access token: the stored one, refreshed first if it's about to
 * expire. Null if logged out, or if Spotify refused it (then the Bar asks to
 * log in again).
 */
async function accessToken($: EngineInterface) {
  const auth = await storedAuth($)
  if (auth === null || auth.accessToken === (await read($, refusedToken))) return null
  if ((await $.clock.now()) < auth.expiresAt - REFRESH_EARLY_MS) return auth.accessToken
  const renewed = await refresh($, auth)
  if (renewed === 'refused') {
    await unauthorized($, auth.accessToken)
    return null
  }
  // A temporary failure: try the old token; the next poll refreshes again.
  return renewed === 'temporary' ? auth.accessToken : renewed.token
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
  if (now < (await read($, backoffUntil)) || (await read($, premiumRequired))) return null
  const token = await accessToken($)
  if (token === null) return null
  // An explicit empty body on PUT and POST: Spotify can refuse one without a length (411).
  const send = (bearer: string) =>
    $.http.fetch(urlOf(call), {
      method: call.method,
      headers: { Authorization: `Bearer ${bearer}`, ...(call.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(call.method === 'GET' ? {} : { body: call.body === undefined ? '' : JSON.stringify(call.body) }),
    })
  let res = await send(token)
  let isRefused = false
  if (res.status === 401) {
    // The token was refused: refresh it and retry once.
    const auth = await storedAuth($)
    const renewed = auth === null ? 'refused' : await refresh($, auth)
    if (typeof renewed === 'object') res = await send(renewed.token)
    else isRefused = renewed === 'refused'
  }
  if (res.status === 429) {
    // Wait as long as Spotify asks before sending anything else.
    const header = Object.entries(res.headers).find(([k]) => k.toLowerCase() === 'retry-after')?.[1]
    const seconds = Number(header ?? 1)
    await update($, backoffUntil, () => now + Math.max(1, Number.isFinite(seconds) ? seconds : 1) * 1000)
  }
  // Refused for good (not a temporary failure at accounts.spotify.com): ask to log in again.
  if (res.status === 401 && isRefused) await unauthorized($, (await storedAuth($))?.accessToken ?? token)
  if (res.status === 403 && res.text.includes('PREMIUM_REQUIRED')) {
    // A free account: say so once and stop, rather than failing on every poll.
    await update($, premiumRequired, () => true)
    await update($, nowPlaying, () => idle(HINT_PREMIUM))
  }
  return { status: res.status, text: res.text }
}

/** Spotify refused `token`, even after a refresh: stop sending it and ask to log in again. */
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
  const np = parsePlayer(reply.status, reply.text, at, await read($, nowPlaying))
  if (np !== null) await update($, nowPlaying, () => np)
}

/** Shows `text` in the Bar in place of the title for a few seconds. */
async function showNote($: EngineInterface, text: string) {
  const until = (await $.clock.now()) + NOTE_MS
  await update($, barNote, () => ({ text, until }))
  // Clear it on time, so the Bar redraws without waiting for the next poll.
  $.clock.after(NOTE_MS, () => void update($, barNote, n => (n.until === until ? { text: '', until: 0 } : n)))
}

/**
 * ▶ with no Active device: move playback to the Device last seen (or the first
 * usable one) and start it there. The Bar says so if there's none to wake.
 */
async function wake($: EngineInterface, np: Playing) {
  const deviceId = pickDevice(await api($, GET_DEVICES), np.deviceId)
  const moved = deviceId === null ? null : await api($, transferCall(deviceId))
  if (deviceId === null || moved === null || moved.status >= 300) return showNote($, NOTE_OPEN_SPOTIFY)
  const at = await $.clock.now()
  await update($, barNote, () => ({ text: '', until: 0 }))
  // Show it playing now: the poll right after a transfer may not see the Device yet.
  await update($, nowPlaying, cur => (cur.kind === 'playing' ? { ...cur, isPlaying: true, at, hasDevice: true, deviceId } : cur))
}

/** A click: send its request, then read Now playing again right away. */
async function send($: EngineInterface, cmd: Command) {
  const np = await read($, nowPlaying)
  if (np.kind !== 'playing') return
  if (!np.hasDevice) {
    // Only ▶ can start a Device; the other Controls would get a 404.
    if (cmd.type === 'toggle') await wake($, np)
    else await showNote($, NOTE_PRESS_PLAY)
    return
  }
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
    return { text: isOn ? 'Demo mode on (fake Spotify).' : 'Demo mode off.' }
  }
  if (what !== 'no-device' && what !== 'no-volume')
    return { text: `unknown /hum-demo option "${args.trim()}". Use /hum-demo, /hum-demo no-device or /hum-demo no-volume.` }
  const d = await read($, demo)
  const player = d.isOn ? d.player : demoPlayer(now)
  const next =
    what === 'no-device'
      ? player.hasDevice ? dropDevice(player, now) : { ...player, hasDevice: true }
      : { ...player, canSetVolume: !player.canSetVolume }
  await update($, demo, () => ({ isOn: true, player: next }))
  await poll($)
  const isSimulating = what === 'no-device' ? !next.hasDevice : !next.canSetVolume
  const label = what === 'no-device' ? 'no active device' : 'volume not supported'
  return { text: `Demo mode on; simulating "${label}" ${isSimulating ? 'on' : 'off'}.` }
}

const NOTE_NO_DEVICE = `${HINT_NO_DEVICE}. Start playing in Spotify on a device, then pick again.`

/**
 * Why a Playlist picker request failed. No reply means hum isn't sending
 * (logged out, a free account, or backing off after a 429); the Bar says which.
 */
const failureNote = (reply: Reply | null) =>
  reply === null ? 'hum isn\'t sending to Spotify right now; the Bar says why.' : `Spotify answered ${reply.status}. Try again.`

/** /hum-playlist: loads the first page of the user's playlists and opens the Playlist picker. */
async function runPlaylist($: EngineInterface) {
  if (!(await read($, demo)).isOn && (await accessToken($)) === null) return { text: 'run /hum-login first to see your playlists.' }
  const me = await api($, GET_ME)
  const userId = parseMe(me)
  if (userId === null) return { text: `couldn't load your playlists. ${failureNote(me)}` }
  const reply = await api($, playlistsCall(0))
  const playlists = parsePlaylists(reply, userId)
  if (playlists === null) return { text: `couldn't load your playlists. ${failureNote(reply)}` }
  await update($, picker, () => ({ userId, playlists, open: null, note: '' }))
  await $.ui.open({ id: PICKER_PANE, title: 'Playlists', focus: true, closeOnEscape: true })
  return { text: 'your playlists are open.' }
}

async function openPlaylist($: EngineInterface, playlist: PlaylistRow) {
  const open = ++latestOpen
  const reply = await api($, itemsCall(playlist.id, 0))
  if (open !== latestOpen) return
  const tracks = parseItems(reply)
  await update($, picker, p =>
    tracks === null
      ? { ...p, note: reply?.status === 403 ? "hum: Spotify doesn't share this playlist's tracks." : `hum: ${failureNote(reply)}` }
      : { ...p, open: { playlist, tracks }, note: '' },
  )
}

/** The More row: the next page of whichever list is showing. */
async function loadMore($: EngineInterface) {
  const p = await read($, picker)
  const open = p.open
  const next = (open === null ? p.playlists : open.tracks).next
  if (next === null) return
  const reply = await api($, open === null ? playlistsCall(next) : itemsCall(open.playlist.id, next))
  await update($, picker, cur => {
    // Back, or another playlist opened, while the page loaded: it belongs to a list no longer shown.
    if (cur.open?.playlist.id !== open?.playlist.id) return cur
    // More pressed again before this page arrived: the list is already past it.
    if ((cur.open === null ? cur.playlists : cur.open.tracks).next !== next) return cur
    if (cur.open === null) {
      const page = parsePlaylists(reply, cur.userId)
      return page === null ? { ...cur, note: `hum: ${failureNote(reply)}` } : { ...cur, playlists: appendPage(cur.playlists, page), note: '' }
    }
    const page = parseItems(reply)
    return page === null
      ? { ...cur, note: `hum: ${failureNote(reply)}` }
      : { ...cur, open: { ...cur.open, tracks: appendPage(cur.open.tracks, page) }, note: '' }
  })
}

/** The URI of the track playing now, or '' when idle. */
async function playingUri($: EngineInterface) {
  const np = await read($, nowPlaying)
  return np.kind === 'playing' ? np.track.uri : ''
}

/** Plays `track` within the open playlist on the Active device, then closes the pane. */
async function playTrack($: EngineInterface, track: TrackRow) {
  const p = await read($, picker)
  const np = await read($, nowPlaying)
  if (p.open === null) return
  if (np.kind === 'playing' && !np.hasDevice) {
    await update($, picker, cur => ({ ...cur, note: NOTE_NO_DEVICE }))
    return
  }
  const reply = await api($, playCall(p.open.playlist.uri, track.position))
  if (reply !== null && reply.status < 300) {
    await update($, picker, cur => ({ ...cur, note: '' }))
    await $.ui.close({ id: PICKER_PANE })
    await poll($)
    return
  }
  // Spotify answers 404 when it has no Active device after all (the last poll was up to 4 s ago).
  await update($, picker, cur => ({ ...cur, note: reply?.status === 404 ? NOTE_NO_DEVICE : `hum: ${failureNote(reply)}` }))
}

/** Runs a host command; its result, or null if it couldn't run. */
async function runQuietly($: EngineInterface, argv: string[], timeoutMs: number) {
  try {
    return await $.process.run(argv, { timeoutMs })
  } catch {
    return null
  }
}

/** Opens `url` in the user's browser: wslview or PowerShell under WSL, open on macOS, else xdg-open. */
async function openBrowser($: EngineInterface, url: string) {
  const wsl = await $.env.get('WSL_DISTRO_NAME')
  if (wsl !== undefined && wsl !== '') {
    if ((await runQuietly($, ['wslview', url], 10_000))?.exitCode === 0) return true
    // Not explorer.exe: it opens File Explorer instead of the browser for a URL this long.
    const command = `Start-Process '${url.replace(/'/g, "''")}'`
    return (await runQuietly($, ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', command], 10_000))?.exitCode === 0
  }
  const system = (await runQuietly($, ['uname'], 5_000))?.stdout.trim() ?? ''
  return (await runQuietly($, [system === 'Darwin' ? 'open' : 'xdg-open', url], 10_000))?.exitCode === 0
}

/** POSTs a form to Spotify's token endpoint; the parsed answer. No answer at all counts as temporary. */
async function tokenRequest($: EngineInterface, fields: Record<string, string>): Promise<TokenReply> {
  try {
    const res = await $.http.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formOf(fields),
    })
    return parseTokenReply(res.status, res.text, await $.clock.now())
  } catch {
    return { ok: false, reason: "couldn't reach accounts.spotify.com", isTemporary: true }
  }
}

/** A fresh login clears what the old one left behind. */
async function clearLoginTrouble($: EngineInterface) {
  await update($, refusedToken, () => null)
  await update($, premiumRequired, () => false)
}

/** What finishLogin answers when the login worked. */
const LOGGED_IN = 'logged in to Spotify.'

/**
 * Finishes a login from Spotify's redirect URL (pasted, or caught by the
 * helper); what happened, as a command reply (Claude Code puts "hum: " before it).
 */
async function finishLogin($: EngineInterface, redirectUrl: string) {
  const pending = await read($, pendingLogin)
  const redirect = parseRedirect(redirectUrl)
  if (pending === null) return 'no login in progress. Run /hum-login <client-id> first.'
  if (redirect === null || redirect.state !== pending.state)
    return "that redirect URL doesn't belong to the login you started. Run /hum-login <client-id> again."
  if (redirect.kind === 'error') {
    await update($, pendingLogin, () => null)
    return `Spotify login was cancelled (${redirect.error}).`
  }
  const reply = await tokenRequest($, {
    grant_type: 'authorization_code',
    code: redirect.code,
    redirect_uri: REDIRECT_URI,
    client_id: pending.clientId,
    code_verifier: pending.verifier,
  })
  // A temporary failure keeps the login pending, so pasting the address again can finish it.
  if (!reply.ok && reply.isTemporary) return `couldn't finish the login (${reply.reason}). Paste the address again: /hum-login <address>`
  await update($, pendingLogin, () => null)
  if (!reply.ok) return `Spotify refused the login (${reply.reason}).`
  const auth: Auth = { clientId: pending.clientId, accessToken: reply.accessToken, refreshToken: reply.refreshToken ?? '', expiresAt: reply.expiresAt }
  await $.store.set('auth', auth)
  await clearLoginTrouble($)
  await poll($)
  return LOGGED_IN
}

/**
 * Runs the node helper, if node is installed, to catch the redirect; false if
 * it can't. It runs in the background; what happens is shown in the Bar.
 */
async function startHelper($: EngineInterface) {
  if ((await runQuietly($, ['node', '--version'], 5_000))?.exitCode !== 0) return false
  const helper = $.process.spawn({ argv: ['node', '-e', HELPER_SCRIPT] })
  void (async () => {
    let out = ''
    let outcome: string | null = null
    try {
      for await (const piece of helper) {
        if (piece.stream !== 'stdout') continue
        out += piece.text
        // Only whole lines: a piece may end mid-URL.
        const line = out.split('\n').slice(0, -1).find(l => l.startsWith(REDIRECT_URI))
        if (line !== undefined) {
          outcome = await finishLogin($, line)
          break
        }
      }
    } catch {
      // The helper couldn't start: reported below.
    }
    // Still pending: the helper stopped (port taken, timed out) without a redirect, unless one was pasted.
    if (outcome === null && (await read($, pendingLogin)) !== null) await update($, nowPlaying, () => idle(HINT_PASTE))
    else if (outcome !== null && outcome !== LOGGED_IN) await update($, nowPlaying, () => idle(`hum: ${outcome}`))
  })()
  return true
}

/** Starts a browser login with `clientId`: the helper first, so it's listening before Spotify redirects. */
async function startLogin($: EngineInterface, clientId: string) {
  const pending: PendingLogin = { clientId, verifier: randomToken(64), state: randomToken(16) }
  await update($, pendingLogin, () => pending)
  const url = authorizeUrl(clientId, await challengeOf(pending.verifier), pending.state)
  const isListening = await startHelper($)
  const opened = await openBrowser($, url)
  const nextStep = isListening
    ? 'Approve it, and hum finishes on its own.'
    : `Approve it, then copy the address the browser lands on (it starts with ${REDIRECT_URI}) and run: /hum-login <that address>`
  return {
    text: opened
      ? `opened the Spotify login in your browser. ${nextStep}`
      : `couldn't open a browser. Open this link to log in:\n${url}\n${nextStep}`,
  }
}

/**
 * /hum-login: with no argument, log in again with the stored client ID (or show
 * the setup steps the first time); a client ID starts the browser login; a
 * pasted redirect URL finishes it.
 */
async function runLogin($: EngineInterface, args: string) {
  const given = args.trim()
  if (given === '') {
    const stored = (await $.store.get('auth')) as Partial<Auth> | undefined
    return typeof stored?.clientId === 'string' && isClientId(stored.clientId) ? startLogin($, stored.clientId) : { text: SETUP_STEPS }
  }
  if (/^https?:\/\//.test(given)) return { text: await finishLogin($, given) }
  if (!isClientId(given))
    return { text: `"${given}" doesn't look like a Spotify client ID (32 letters and digits). Run /hum-login for the steps.` }
  return startLogin($, given)
}

/** /hum-logout: forget the login (client ID and tokens). */
async function runLogout($: EngineInterface) {
  const wasLoggedIn = (await storedAuth($)) !== null || (await read($, pendingLogin)) !== null
  await $.store.delete('auth')
  await update($, pendingLogin, () => null)
  await clearLoginTrouble($)
  await update($, mutedFrom, () => null)
  await poll($)
  return { text: wasLoggedIn ? 'logged out of Spotify.' : 'not logged in.' }
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
  if (wanted === '') return { text: `look: ${STYLE_NAMES[await chosenStyle($)]}. Choices: ${choices}.` }
  if (!isStyle(wanted)) return { text: `no look called "${args.trim()}". Choices: ${choices}.` }
  await $.state.set(styleRef, wanted)
  await $.store.set('style', wanted)
  return { text: `look: ${STYLE_NAMES[wanted]}` }
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
  const now = await $.clock.now()
  const note = await read($, barNote)
  return drawBar(el, np, { style: await chosenStyle($), columns, now, caps, note: now < note.until ? note.text : '' }, cmd => send($, cmd))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'hum-style',
      description: 'Switch the hum Bar look: Glossy, Minimal or Glass',
      argumentHint: '[glossy|minimal|glass]',
    })
    await $.command.register({
      name: 'hum-login',
      description: 'Log in to Spotify with your own Developer app (run with no argument for the steps)',
      argumentHint: '[client-id | pasted redirect URL]',
    })
    await $.command.register({
      name: 'hum-logout',
      description: 'Forget your Spotify login (client ID and tokens)',
    })
    await $.command.register({
      name: 'hum-playlist',
      description: 'Browse your Spotify playlists and play a track',
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
  on('command.run', { command: 'hum-login' }, async ($, e) => runLogin($, e.args ?? ''))
  on('command.run', { command: 'hum-logout' }, async $ => runLogout($))
  on('command.run', { command: 'hum-playlist' }, async $ => runPlaylist($))

  on('ui.render', { component: 'PromptHint' }, async ($, e) => drawUnderPrompt($, e as never, e.viewport?.columns ?? 80))

  on('ui.render', { component: 'Pane', requestId: PICKER_PANE }, async ($, e) =>
    drawPicker($.ui.resolve(e) as Record<string, any>, await read($, picker), e.props.bodyColumns, await playingUri($), {
      openPlaylist: playlist => openPlaylist($, playlist),
      back: () => update($, picker, p => ({ ...p, open: null, note: '' })),
      more: () => loadMore($),
      play: track => playTrack($, track),
    }),
  )

  // The Seek bar (hooks/bar/seek.tsx) posts where it was clicked.
  on('ui.message', { module: 'hooks/bar/seek.tsx' }, async ($, e, next) => {
    const fraction = (e.data as { fraction?: unknown }).fraction
    if (typeof fraction === 'number') await send($, { type: 'seek', fraction })
    return next(e)
  })
}
