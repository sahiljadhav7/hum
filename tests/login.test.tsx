// /hum-login and /hum-logout at three seams: the commands and the Bar, the
// HTTP boundary (accounts.spotify.com and api.spotify.com stand-ins), and the
// host boundary (the browser opener and the node helper, stood in for).
import { expect, test } from 'claude-code/testing'

import { bar, CLIENT_ID, formFields, host, openedUrl, playerBody, run, setup, sha256url, spotify, startSession, TOKEN_URL, until } from './helpers'

const login = async ($: any, args = '') => run($, 'hum-login', args)

test('/hum-login with no client ID explains the Developer app setup', async ($, on) => {
  setup(on)
  await startSession($, on)
  const text = await login($)
  expect(text).toContain('https://developer.spotify.com/dashboard')
  expect(text).toContain('http://127.0.0.1:8898/callback')
  expect(text).toContain('Web API')
  expect(text).toContain('/hum-login <client-id>')
})

test('/hum-login rejects something that is not a client ID', async ($, on) => {
  setup(on)
  await startSession($, on)
  expect(await login($, 'hello')).toBe(
    '"hello" doesn\'t look like a Spotify client ID (32 letters and digits). Run /hum-login for the steps.',
  )
})

test('under WSL, /hum-login opens the Spotify login with wslview, PKCE and the scopes', async ($, on) => {
  setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  const ran = host(on)
  await startSession($, on)
  const text = await login($, CLIENT_ID)
  expect(text).toContain('opened')
  const url = openedUrl(ran)!
  expect(ran.find(r => r.argv[0] === 'wslview')).toBeDefined()
  expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize')
  expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
  expect(url.searchParams.get('response_type')).toBe('code')
  expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:8898/callback')
  expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
  expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{16,}$/)
  expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual(
    ['playlist-read-collaborative', 'playlist-read-private', 'user-modify-playback-state', 'user-read-playback-state'],
  )
})

test('under WSL without wslview, it opens the whole login URL with PowerShell, not explorer.exe', async ($, on) => {
  setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  const ran = host(on, argv => ({ exitCode: argv[0] === 'wslview' ? 127 : 0 }))
  await startSession($, on)
  await login($, CLIENT_ID)
  expect(ran.some(r => r.argv[0] === 'explorer.exe')).toBe(false)
  const ps = ran.find(r => r.argv[0] === 'powershell.exe')!
  const url = new URL(/^Start-Process '(.*)'$/.exec(ps.argv[ps.argv.length - 1]!)![1]!)
  expect(url.searchParams.get('client_id')).toBe(CLIENT_ID)
  expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{16,}$/)
})

test('on Linux it uses xdg-open; on macOS, open', async ($, on) => {
  setup(on)
  const ran = host(on, argv => (argv[0] === 'uname' ? { exitCode: 0, stdout: 'Linux\n' } : { exitCode: 0 }))
  await startSession($, on)
  await login($, CLIENT_ID)
  expect(ran.some(r => r.argv[0] === 'xdg-open')).toBe(true)
})

test('on macOS it uses open', async ($, on) => {
  setup(on)
  const ran = host(on, argv => (argv[0] === 'uname' ? { exitCode: 0, stdout: 'Darwin\n' } : { exitCode: 0 }))
  await startSession($, on)
  await login($, CLIENT_ID)
  expect(ran.some(r => r.argv[0] === 'open')).toBe(true)
})

test('if no browser opens, /hum-login prints the link to open by hand', async ($, on) => {
  setup(on)
  host(on, () => ({ exitCode: 1 }))
  await startSession($, on)
  const text = await login($, CLIENT_ID)
  expect(text).toContain('https://accounts.spotify.com/authorize?')
})

const REDIRECT = 'http://127.0.0.1:8898/callback'

/** Spotify stand-in: the token endpoint grants `tokens`; the player plays Espresso. */
function spotifyWithLogin(on: any, tokens: Record<string, unknown> = { access_token: 'acc-1', refresh_token: 'ref-1', expires_in: 3600 }) {
  return spotify(on, req =>
    req.url === TOKEN_URL ? { status: 200, body: { token_type: 'Bearer', ...tokens } } : { status: 200, body: playerBody() },
  )
}

test('pasting the redirect URL finishes the login: PKCE code exchange, then the Bar plays', async ($, on) => {
  setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  const ran = host(on, argv => ({ exitCode: argv[0] === 'node' ? 127 : 0 })) // no node: paste-back
  const sent = spotifyWithLogin(on)
  await startSession($, on)
  await login($, CLIENT_ID)
  const opened = openedUrl(ran)!
  const state = opened.searchParams.get('state')!
  expect(await login($, `${REDIRECT}?code=the-code&state=${state}`)).toBe('logged in to Spotify.')
  const exchange = sent.find(r => r.url === TOKEN_URL)!
  expect(exchange.method).toBe('POST')
  expect(exchange.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
  const form = formFields(exchange.body)
  expect(form).toMatchObject({ grant_type: 'authorization_code', code: 'the-code', redirect_uri: REDIRECT, client_id: CLIENT_ID })
  expect(form.client_secret).toBeUndefined()
  expect(await sha256url(form.code_verifier!)).toBe(opened.searchParams.get('code_challenge'))
  expect(sent.at(-1)).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer acc-1' } })
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Espresso/ })).toBeDefined()
  await ui.unmount()
})

test('a redirect URL from another login attempt is refused', async ($, on) => {
  setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  host(on)
  const sent = spotifyWithLogin(on)
  await startSession($, on)
  await login($, CLIENT_ID)
  expect(await login($, `${REDIRECT}?code=x&state=not-ours`)).toBe(
    "that redirect URL doesn't belong to the login you started. Run /hum-login <client-id> again.",
  )
  expect(sent.some(r => r.url === TOKEN_URL)).toBe(false)
})

test('a cancelled login says so', async ($, on) => {
  setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  const ran = host(on)
  await startSession($, on)
  await login($, CLIENT_ID)
  const state = openedUrl(ran)!.searchParams.get('state')!
  expect(await login($, `${REDIRECT}?error=access_denied&state=${state}`)).toBe('Spotify login was cancelled (access_denied).')
})

test('pasting a redirect URL before starting a login says what to run first', async ($, on) => {
  setup(on)
  await startSession($, on)
  expect(await login($, `${REDIRECT}?code=x&state=y`)).toBe('no login in progress. Run /hum-login <client-id> first.')
})

test('a failed code exchange says why and leaves hum logged out', async ($, on) => {
  setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  const ran = host(on)
  spotify(on, req =>
    req.url === TOKEN_URL ? { status: 400, body: { error: 'invalid_grant', error_description: 'Invalid authorization code' } } : { status: 200, body: playerBody() },
  )
  await startSession($, on)
  await login($, CLIENT_ID)
  const state = openedUrl(ran)!.searchParams.get('state')!
  expect(await login($, `${REDIRECT}?code=bad&state=${state}`)).toBe('Spotify refused the login (invalid_grant: Invalid authorization code).')
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: 'hum: run /hum-login' })).toBeDefined()
  await ui.unmount()
})

test('with node available, a helper on 127.0.0.1:8898 catches the redirect and finishes the login', async ($, on) => {
  const clock = setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  const ran = host(on, argv => (argv[0] === 'node' ? { exitCode: 0, stdout: 'v24.2.0\n' } : { exitCode: 0 }))
  const spawned: string[][] = []
  on('process.spawn', (async function* (_$: unknown, e: { argv: readonly string[] }) {
    spawned.push([...e.argv])
    await until(() => openedUrl(ran) !== undefined) // the helper starts before the browser opens
    const state = openedUrl(ran)!.searchParams.get('state')!
    yield { stream: 'stdout', text: `${REDIRECT}?code=from-helper&state=${state}\n` }
    return { value: { code: 0, signal: null } }
  }) as any)
  const sent = spotifyWithLogin(on)
  await startSession($, on)
  expect(await login($, CLIENT_ID)).toContain('opened')
  await clock.settle() // the helper runs in the background
  expect(spawned[0]?.[0]).toBe('node')
  expect(spawned[0]?.join(' ')).toContain('8898')
  expect(formFields(sent.find(r => r.url === TOKEN_URL)?.body).code).toBe('from-helper')
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Espresso/ })).toBeDefined()
  await ui.unmount()
})

const API = 'https://api.spotify.com/v1'
const STORED = (over: Record<string, unknown> = {}) => ({
  auth: { clientId: CLIENT_ID, accessToken: 'old', refreshToken: 'ref-1', expiresAt: 3_600_000, ...over },
})

/** Spotify stand-in: refresh grants `access`; the player answers 401 to any token not in `valid`. */
function spotifyRefreshing(on: any, valid: string[], refresh: () => { status: number; body: unknown }) {
  return spotify(on, req => {
    if (req.url === TOKEN_URL) return refresh()
    const token = req.headers.Authorization?.replace('Bearer ', '') ?? ''
    return valid.includes(token) ? { status: 200, body: playerBody() } : { status: 401, body: { error: { status: 401, message: 'The access token expired' } } }
  })
}

test('an access token about to expire is refreshed before the request', async ($, on) => {
  setup(on, {}, STORED({ expiresAt: 30_000 })) // expires 29 s after the clock's 1 s
  const sent = spotifyRefreshing(on, ['new'], () => ({ status: 200, body: { access_token: 'new', expires_in: 3600 } }))
  await startSession($, on)
  const refresh = sent.find(r => r.url === TOKEN_URL)!
  expect(formFields(refresh.body)).toEqual({ grant_type: 'refresh_token', refresh_token: 'ref-1', client_id: CLIENT_ID })
  const reads = sent.filter(r => r.url.startsWith(`${API}/me/player`))
  expect(reads.map(r => r.headers.Authorization)).toEqual(['Bearer new'])
})

test('a 401 refreshes the token and retries the request once', async ($, on) => {
  setup(on, {}, STORED())
  const sent = spotifyRefreshing(on, ['new'], () => ({ status: 200, body: { access_token: 'new', expires_in: 3600 } }))
  await startSession($, on)
  expect(sent.map(r => (r.url === TOKEN_URL ? 'refresh' : r.headers.Authorization))).toEqual(['Bearer old', 'refresh', 'Bearer new'])
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Espresso/ })).toBeDefined()
  await ui.unmount()
})

test('a rotated refresh token is kept for the next refresh', async ($, on) => {
  const clock = setup(on, {}, STORED({ expiresAt: 30_000 }))
  let n = 0
  const sent = spotifyRefreshing(on, ['new-1', 'new-2'], () => {
    n++
    return { status: 200, body: { access_token: `new-${n}`, refresh_token: `ref-${n + 1}`, expires_in: 120 } }
  })
  await startSession($, on) // at 1 s: refresh 1 (with ref-1); new-1 lasts to 121 s, so refresh at 61 s
  await clock.advance(64_000) // the poll at 61 s refreshes with ref-2; new-2 lasts to 181 s
  const refreshes = sent.filter(r => r.url === TOKEN_URL).map(r => formFields(r.body).refresh_token)
  expect(refreshes).toEqual(['ref-1', 'ref-2'])
})

test('when the refresh is refused too, the Bar asks to log in and hum stops sending', async ($, on) => {
  const clock = setup(on, {}, STORED())
  const sent = spotifyRefreshing(on, [], () => ({ status: 400, body: { error: 'invalid_grant', error_description: 'Refresh token revoked' } }))
  await startSession($, on)
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: 'hum: run /hum-login' })).toBeDefined()
  const before = sent.length
  await clock.advance(12_000)
  expect(sent.length).toBe(before)
  await ui.unmount()
})

const PREMIUM_REQUIRED = { status: 403, body: { error: { status: 403, message: 'Player command failed: Premium required', reason: 'PREMIUM_REQUIRED' } } }

test('a free account gets one clear line, and hum stops sending', async ($, on) => {
  const clock = setup(on, {}, STORED())
  const sent = spotify(on, req => (req.method === 'GET' ? { status: 200, body: playerBody() } : PREMIUM_REQUIRED))
  await startSession($, on)
  const ui = await bar($)
  await ui.press({ key: 'next' })
  expect(await ui.find({ type: 'Text', text: 'hum: Spotify Premium is needed to control playback' })).toBeDefined()
  expect(await ui.find({ key: 'play' })).toBeUndefined()
  const before = sent.length
  await clock.advance(12_000)
  expect(sent.length).toBe(before)
  await ui.unmount()
})

test('/hum-logout forgets the login: the Bar asks to log in and nothing more is sent', async ($, on) => {
  const clock = setup(on, {}, STORED())
  const sent = spotify(on, () => ({ status: 200, body: playerBody() }))
  await startSession($, on)
  expect(await run($, 'hum-logout')).toBe('logged out of Spotify.')
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: 'hum: run /hum-login' })).toBeDefined()
  const before = sent.length
  await clock.advance(12_000)
  expect(sent.length).toBe(before)
  await ui.unmount()
})

test('/hum-logout when not logged in says so', async ($, on) => {
  setup(on)
  await startSession($, on)
  expect(await run($, 'hum-logout')).toBe('not logged in.')
})

// Code-review follow-ups.

/** Records process.run and process.spawn in one order; spawn yields `pieces` then exits with `code`. */
function hostWithHelper(on: any, pieces: (state: string) => string[], code = 0) {
  const order: string[] = []
  const ran = host(on, argv => {
    order.push(argv[0]!)
    return argv[0] === 'node' ? { exitCode: 0, stdout: 'v24.2.0\n' } : { exitCode: 0 }
  })
  on('process.spawn', (async function* (_$: unknown, e: { argv: readonly string[] }) {
    order.push(`spawn ${e.argv[0]}`)
    await until(() => openedUrl(ran) !== undefined) // the helper starts before the browser opens
    const state = openedUrl(ran)?.searchParams.get('state') ?? ''
    for (const text of pieces(state)) yield { stream: 'stdout', text }
    return { value: { code, signal: null } }
  }) as any)
  return { ran, order }
}

test('the helper is listening before the browser opens', async ($, on) => {
  const clock = setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  const { order } = hostWithHelper(on, () => [])
  spotifyWithLogin(on)
  await startSession($, on)
  await login($, CLIENT_ID)
  await clock.settle()
  expect(order.indexOf('spawn node')).toBeGreaterThan(-1)
  expect(order.indexOf('spawn node')).toBeLessThan(order.indexOf('wslview'))
})

test('a redirect URL split across output pieces is read whole', async ($, on) => {
  const clock = setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  hostWithHelper(on, state => [`${REDIRECT}?code=split-`, `code&state=${state}\n`])
  const sent = spotifyWithLogin(on)
  await startSession($, on)
  await login($, CLIENT_ID)
  await clock.settle()
  expect(formFields(sent.find(r => r.url === TOKEN_URL)?.body).code).toBe('split-code')
})

test('if the helper stops without a redirect (port taken), the Bar says to paste the URL', async ($, on) => {
  const clock = setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  hostWithHelper(on, () => [], 1)
  spotifyWithLogin(on)
  await startSession($, on)
  await login($, CLIENT_ID)
  await clock.settle()
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: "hum: couldn't catch the login. Paste the address the browser landed on: /hum-login <address>" })).toBeDefined()
  await ui.unmount()
})

test('a login the helper caught but Spotify refused shows the reason in the Bar', async ($, on) => {
  const clock = setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  hostWithHelper(on, state => [`${REDIRECT}?code=bad&state=${state}\n`])
  spotify(on, req =>
    req.url === TOKEN_URL ? { status: 400, body: { error: 'invalid_grant', error_description: 'Invalid authorization code' } } : { status: 200, body: playerBody() },
  )
  await startSession($, on)
  await login($, CLIENT_ID)
  await clock.settle()
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: 'hum: Spotify refused the login (invalid_grant: Invalid authorization code).' })).toBeDefined()
  await ui.unmount()
})

test('/hum-login with a client ID already stored logs in again without asking for it', async ($, on) => {
  setup(on, { WSL_DISTRO_NAME: 'Ubuntu' }, STORED())
  const ran = host(on)
  spotifyRefreshing(on, [], () => ({ status: 400, body: { error: 'invalid_grant' } })) // the old login is dead
  await startSession($, on)
  expect(await login($)).toContain('opened')
  expect(openedUrl(ran)?.searchParams.get('client_id')).toBe(CLIENT_ID)
})

test('an outage at accounts.spotify.com during refresh does not log you out', async ($, on) => {
  const clock = setup(on, {}, STORED())
  let down = true
  const sent = spotifyRefreshing(on, ['new'], () => (down ? { status: 503, body: { error: 'server_error' } } : { status: 200, body: { access_token: 'new', expires_in: 3600 } }))
  await startSession($, on) // 401, refresh gets 503
  down = false
  await clock.advance(4_000) // next poll: 401 again, refresh works
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Espresso/ })).toBeDefined()
  expect(sent.filter(r => r.url === TOKEN_URL).length).toBe(2)
  await ui.unmount()
})

test('the PKCE verifier is 43 to 128 unreserved characters', async ($, on) => {
  setup(on, { WSL_DISTRO_NAME: 'Ubuntu' })
  const ran = host(on, argv => ({ exitCode: argv[0] === 'node' ? 127 : 0 }))
  const sent = spotifyWithLogin(on)
  await startSession($, on)
  await login($, CLIENT_ID)
  const state = openedUrl(ran)!.searchParams.get('state')!
  await login($, `${REDIRECT}?code=c&state=${state}`)
  const verifier = formFields(sent.find(r => r.url === TOKEN_URL)?.body).code_verifier!
  expect(verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/)
})

test('the setup steps name the scopes hum asks for', async ($, on) => {
  setup(on)
  await startSession($, on)
  const text = await login($)
  for (const scope of ['user-read-playback-state', 'user-modify-playback-state', 'playlist-read-private', 'playlist-read-collaborative'])
    expect(text).toContain(scope)
})
