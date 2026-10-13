// hum against Spotify: the mounted Bar and commands, with a test standing in
// for api.spotify.com beneath the plugin (the HTTP seam), and Demo mode
// running the real client against hum's own fake Web API.
import { expect, test } from 'claude-code/testing'

import { bar, countdownOf, demo, playerBody, setup, spotify, startSession } from './helpers'

test('before /hum-login, with Demo mode off, the Bar is the Idle hint to log in', async ($, on) => {
  setup(on)
  await startSession($, on)
  const ui = await bar($)
  const hint = await ui.find({ type: 'Text', text: 'hum: run /hum-login' })
  expect(hint).toBeDefined()
  expect(hint.props.dimColor).toBe(true)
  expect(await ui.find({ key: 'play' })).toBeUndefined()
  await ui.unmount()
})

const LOGGED_IN = { auth: { accessToken: 'tok-1' } }
const API = 'https://api.spotify.com/v1'

test('logged in, hum reads Now playing from Spotify with the token and draws it', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const sent = spotify(on, () => ({ status: 200, body: playerBody({ artists: ['Sabrina Carpenter', 'Guest'] }) }))
  await startSession($, on)
  expect(sent[0]).toMatchObject({ method: 'GET', url: `${API}/me/player?additional_types=episode`, headers: { Authorization: 'Bearer tok-1' } })
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Espresso/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Sabrina Carpenter, Guest/ })).toBeDefined()
  expect(await countdownOf(ui)).toBe('-1:55') // 2:55 long, 1:00 in
  await ui.unmount()
})

test('a 204 from Spotify (no Active device) is the Idle hint, no Controls', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  spotify(on, () => ({ status: 204 }))
  await startSession($, on)
  const ui = await bar($)
  const hint = await ui.find({ type: 'Text', text: 'hum: no active Spotify device' })
  expect(hint?.props?.dimColor).toBe(true)
  expect(await ui.find({ key: 'play' })).toBeUndefined()
  await ui.unmount()
})

test('each click sends its Web API request, then reads Now playing again', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const sent = spotify(on, () => ({ status: 200, body: playerBody({ volume: 70 }) }))
  await startSession($, on)
  const ui = await bar($)
  const after = async (press: () => Promise<unknown>) => {
    const from = sent.length
    await press()
    return sent.slice(from).map(r => `${r.method} ${r.url.replace(API, '')}`)
  }
  expect(await after(() => ui.press({ key: 'play' }))).toEqual(['PUT /me/player/pause', 'GET /me/player?additional_types=episode'])
  expect(await after(() => ui.press({ key: 'next' }))).toEqual(['POST /me/player/next', 'GET /me/player?additional_types=episode'])
  expect(await after(() => ui.press({ key: 'prev' }))).toEqual(['POST /me/player/previous', 'GET /me/player?additional_types=episode'])
  expect(await after(() => ui.press({ key: 'shuffle' }))).toEqual(['PUT /me/player/shuffle?state=true', 'GET /me/player?additional_types=episode'])
  expect(await after(() => ui.press({ key: 'repeat' }))).toEqual(['PUT /me/player/repeat?state=context', 'GET /me/player?additional_types=episode'])
  expect(await after(() => ui.press({ key: 'volume' }))).toEqual(['PUT /me/player/volume?volume_percent=0', 'GET /me/player?additional_types=episode'])
  expect(
    await after(async () => {
      await ui.pointer({ type: 'down', x: 11, y: 0, button: 'left', in: 'seek' })
      await ui.pointer({ type: 'up', x: 11, y: 0, button: 'left', in: 'seek' })
    }),
  ).toEqual(['PUT /me/player/seek?position_ms=83854', 'GET /me/player?additional_types=episode']) // 11.5 / 24 of 2:55
  await ui.unmount()
})

test('a paused track sends play; unmute restores the volume from before', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  let volume = 70
  const sent = spotify(on, req => {
    const m = /volume_percent=(\d+)/.exec(req.url)
    if (m) volume = Number(m[1])
    return { status: req.method === 'GET' ? 200 : 204, body: req.method === 'GET' ? playerBody({ isPlaying: false, volume }) : undefined }
  })
  await startSession($, on)
  const ui = await bar($)
  await ui.press({ key: 'play' })
  expect(sent.some(r => r.method === 'PUT' && r.url === `${API}/me/player/play`)).toBe(true)
  await ui.press({ key: 'volume' }) // mute: 70 → 0
  await ui.press({ key: 'volume' }) // unmute: back to 70
  expect(sent.filter(r => r.url.includes('volume_percent')).map(r => r.url.replace(`${API}/me/player/volume?`, ''))).toEqual([
    'volume_percent=0',
    'volume_percent=70',
  ])
  await ui.unmount()
})

test('Now playing is read every 4 s', async ($, on) => {
  const clock = setup(on, {}, LOGGED_IN)
  const sent = spotify(on, () => ({ status: 200, body: playerBody() }))
  await startSession($, on)
  const before = sent.length
  await clock.advance(12_000)
  expect(sent.length - before).toBe(3)
})

test('after a 429, hum sends nothing until Retry-After has passed', async ($, on) => {
  const clock = setup(on, {}, LOGGED_IN)
  let limited = true
  const sent = spotify(on, () =>
    limited ? { status: 429, headers: { 'Retry-After': '10' } } : { status: 200, body: playerBody() },
  )
  await startSession($, on) // the first read gets the 429
  limited = false
  const before = sent.length
  await clock.advance(9_000) // polls at 4 s and 8 s are held back
  expect(sent.length).toBe(before)
  await clock.advance(4_000) // the poll at 12 s goes out
  expect(sent.length).toBe(before + 1)
})

test('a 401 (token refused) replaces the Bar with the hint to log in again', async ($, on) => {
  const clock = setup(on, {}, LOGGED_IN)
  let refused = false
  spotify(on, () => (refused ? { status: 401 } : { status: 200, body: playerBody() }))
  await startSession($, on)
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Espresso/ })).toBeDefined()
  refused = true
  await clock.advance(4_000) // the next poll is refused
  expect(await ui.find({ type: 'Text', text: 'hum: run /hum-login' })).toBeDefined()
  expect(await ui.find({ key: 'play' })).toBeUndefined()
  await ui.unmount()
})

test('the volume icon is greyed out and not clickable when the Device cannot set volume', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const sent = spotify(on, () => ({ status: 200, body: playerBody({ supportsVolume: false }) }))
  await startSession($, on)
  const ui = await bar($)
  expect(await ui.find({ type: 'Button', key: 'volume' })).toBeUndefined() // not clickable
  const icon = await ui.find({ type: 'Text', text: '◁))' }) // volume 70%
  expect(icon?.props?.dimColor).toBe(true)
  expect(sent.some(r => r.url.includes('/volume'))).toBe(false)
  await ui.unmount()
})

test('/hum-demo turns Demo mode on and off', async ($, on) => {
  setup(on)
  await startSession($, on)
  expect(await demo($)).toBe('hum: Demo mode on (fake Spotify).')
  let ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Muddy Feet/ })).toBeDefined()
  await ui.unmount()
  expect(await demo($)).toBe('hum: Demo mode off.')
  ui = await bar($)
  expect(await ui.find({ type: 'Text', text: 'hum: run /hum-login' })).toBeDefined()
  await ui.unmount()
})

test('Demo mode sends nothing to Spotify', async ($, on) => {
  const clock = setup(on, {}, LOGGED_IN)
  const sent = spotify(on, () => ({ status: 200, body: playerBody() }))
  await startSession($, on)
  await demo($)
  const before = sent.length
  const ui = await bar($)
  await ui.press({ key: 'next' })
  await clock.advance(8_000)
  expect(sent.length).toBe(before)
  await ui.unmount()
})

test("Demo mode's fake Spotify keeps its state across requests", async ($, on) => {
  const clock = setup(on)
  await startSession($, on)
  await demo($)
  const ui = await bar($)
  await ui.press({ key: 'shuffle' })
  await ui.press({ key: 'volume' })
  await clock.advance(8_000) // two more polls
  expect((await ui.find({ key: 'shuffle' }))?.children?.[0]?.props?.underline).toBe(true)
  expect(await ui.find({ type: 'Text', text: '◁× ' })).toBeDefined()
  await ui.unmount()
})

test('/hum-demo no-device simulates no Active device: the Idle hint', async ($, on) => {
  setup(on)
  await startSession($, on)
  expect(await demo($, 'no-device')).toBe('hum: Demo mode on; simulating "no active device" on.')
  let ui = await bar($)
  expect(await ui.find({ type: 'Text', text: 'hum: no active Spotify device' })).toBeDefined()
  expect(await ui.find({ key: 'play' })).toBeUndefined()
  await ui.unmount()
  expect(await demo($, 'no-device')).toBe('hum: Demo mode on; simulating "no active device" off.')
  ui = await bar($)
  expect(await ui.find({ key: 'play' })).toBeDefined()
  await ui.unmount()
})

test('/hum-demo no-volume simulates a Device without remote volume: the icon is greyed', async ($, on) => {
  setup(on)
  await startSession($, on)
  await demo($, 'no-volume')
  const ui = await bar($)
  expect(await ui.find({ type: 'Button', key: 'volume' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: '◁))' }))?.props?.dimColor).toBe(true)
  await ui.unmount()
})

test('/hum-demo with an unknown option says what it takes', async ($, on) => {
  setup(on)
  await startSession($, on)
  expect(await demo($, 'disco')).toBe('hum: unknown /hum-demo option "disco". Use /hum-demo, /hum-demo no-device or /hum-demo no-volume.')
})

test('between polls the countdown keeps ticking on its own', async ($, on) => {
  setup(on)
  await startSession($, on)
  await demo($)
  const ui = await bar($)
  expect(await countdownOf(ui)).toBe('-3:49')
  await ui.advance(3_000) // the Seek bar's own clock, no new poll
  expect(await countdownOf(ui)).toBe('-3:46')
  await ui.unmount()
})

test('a Spotify error (e.g. 502) keeps the last Now playing instead of claiming no Device', async ($, on) => {
  const clock = setup(on, {}, LOGGED_IN)
  let failing = false
  spotify(on, () => (failing ? { status: 502, body: { error: { status: 502, message: 'Bad gateway' } } } : { status: 200, body: playerBody() }))
  await startSession($, on)
  const ui = await bar($)
  failing = true
  await clock.advance(4_000)
  expect(await ui.find({ type: 'Text', text: /Espresso/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'hum: no active Spotify device' })).toBeUndefined()
  await ui.unmount()
})

test('podcasts: hum asks for episodes and shows the episode and its show', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const episode = {
    ...playerBody(),
    currently_playing_type: 'episode',
    item: { id: 'e1', type: 'episode', name: 'Episode 12', duration_ms: 1_800_000, show: { name: 'The Show' }, images: [] },
  }
  const sent = spotify(on, () => ({ status: 200, body: episode }))
  await startSession($, on)
  expect(sent[0]!.url).toBe(`${API}/me/player?additional_types=episode`)
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Episode 12/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /The Show/ })).toBeDefined()
  await ui.unmount()
})

test('during an ad the Bar says so instead of claiming no Device', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  spotify(on, () => ({ status: 200, body: { ...playerBody(), currently_playing_type: 'ad', item: null } }))
  await startSession($, on)
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: 'hum: ad playing' })).toBeDefined()
  await ui.unmount()
})

test('PUT and POST requests carry an explicit empty body (Spotify can refuse one without a length)', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const sent = spotify(on, () => ({ status: 200, body: playerBody() }))
  await startSession($, on)
  const ui = await bar($)
  await ui.press({ key: 'next' })
  expect(sent.find(r => r.method === 'POST')?.body).toBe('')
  await ui.unmount()
})

test('after a 401, the refused token is not sent again', async ($, on) => {
  const clock = setup(on, {}, LOGGED_IN)
  const sent = spotify(on, () => ({ status: 401 }))
  await startSession($, on)
  const before = sent.length
  await clock.advance(12_000)
  expect(sent.length).toBe(before)
})

test("Demo mode's mute does not leak into real playback after /hum-demo off", async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const sent = spotify(on, () => ({ status: 200, body: playerBody({ volume: 0 }) }))
  await startSession($, on)
  await demo($)
  let ui = await bar($)
  await ui.press({ key: 'volume' }) // Demo: 60% → muted, remembering 60%
  await ui.unmount()
  await demo($) // off: real Spotify, whose Device is at 0
  ui = await bar($)
  await ui.press({ key: 'volume' }) // unmute real playback
  expect(sent.find(r => r.url.includes('volume_percent'))?.url).toBe(`${API}/me/player/volume?volume_percent=50`)
  await ui.unmount()
})
