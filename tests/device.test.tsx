// The Bar stays active when the music stops (issue 09): Spotify dropping the
// Device keeps the last track, paused, with its Controls, and ▶ wakes a
// Device. Tested at the Bar and at api.spotify.com.
import { expect, test } from 'claude-code/testing'

import { bar, countdownOf, demo, playerBody, setup, spotify, startSession } from './helpers'
import type { Sent } from './helpers'

const API = 'https://api.spotify.com/v1'
const LOGGED_IN = { auth: { accessToken: 'tok-1' } }

/** A Device as `GET /v1/me/player/devices` lists it. */
const device = (id: string | null, over: { isRestricted?: boolean; name?: string } = {}) => ({
  id,
  is_active: false,
  is_private_session: false,
  is_restricted: over.isRestricted ?? false,
  name: over.name ?? 'Phone',
  type: 'smartphone',
  volume_percent: 50,
  supports_volume: true,
})

/**
 * Spotify with a Device that is dropped once `drop()` is called: the player
 * answers 204 from then on until a transfer succeeds. `devices` is the list.
 */
function account(on: any, opts: { devices?: unknown[]; transfer?: number; startWithout?: boolean } = {}) {
  let hasDevice = opts.startWithout !== true
  const sent = spotify(on, req => {
    const path = new URL(req.url).pathname.replace('/v1', '')
    if (req.method === 'GET' && path === '/me/player') return hasDevice ? { status: 200, body: playerBody() } : { status: 204 }
    if (req.method === 'GET' && path === '/me/player/devices') return { status: 200, body: { devices: opts.devices ?? [device('d1')] } }
    if (req.method === 'PUT' && path === '/me/player') {
      const status = opts.transfer ?? 204
      if (status < 300) hasDevice = true
      return { status }
    }
    return { status: 204 }
  })
  return { sent, drop: () => (hasDevice = false) }
}

const asked = (sent: Sent[]) => sent.map(r => `${r.method} ${r.url.replace(API, '')}`)

test('when Spotify drops the Device the Bar keeps the last track, paused, with its Controls', async ($, on) => {
  const clock = setup(on, {}, LOGGED_IN)
  const { drop } = account(on)
  await startSession($, on)
  drop()
  await clock.advance(4_000) // the next poll: 204
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Espresso/ })).toBeDefined()
  expect(await ui.find({ key: 'play' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' ▶' })).toBeDefined()
  // 2:55 long, 1:00 in at the first poll, playing 4 s more: 1:51 left, and frozen there.
  expect(await countdownOf(ui)).toBe('-1:51')
  await clock.advance(8_000)
  expect(await countdownOf(ui)).toBe('-1:51')
  await ui.unmount()
})

test('with no Device from the start the Bar shows its Controls and "Nothing playing"', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  account(on, { startWithout: true })
  await startSession($, on)
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Nothing playing/ })).toBeDefined()
  expect(await ui.find({ key: 'play' })).toBeDefined()
  expect(await ui.find({ key: 'next' })).toBeDefined()
  await ui.unmount()
})

test('▶ with no Device wakes the one used last, then plays', async ($, on) => {
  const clock = setup(on, {}, LOGGED_IN)
  const { sent, drop } = account(on, { devices: [device('d0', { name: 'Laptop' }), device('d1')] })
  await startSession($, on) // plays on d1
  drop()
  await clock.advance(4_000)
  const ui = await bar($)
  const from = sent.length
  await ui.press({ key: 'play' })
  expect(asked(sent.slice(from)).slice(0, 2)).toEqual(['GET /me/player/devices', 'PUT /me/player'])
  const transfer = sent.find(r => r.method === 'PUT' && r.url === `${API}/me/player`)
  expect(transfer?.headers['Content-Type']).toBe('application/json')
  // As Spotify's Transfer Playback takes it: one Device id, and play to start there.
  expect(JSON.parse(transfer?.body ?? '{}')).toEqual({ device_ids: ['d1'], play: true })
  expect(await ui.find({ type: 'Text', text: '❚❚' })).toBeDefined()
  await ui.unmount()
})

test('with no Device remembered, ▶ wakes the first listed Device that takes commands', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const { sent } = account(on, { startWithout: true, devices: [device(null), device('tv', { isRestricted: true }), device('phone')] })
  await startSession($, on)
  const ui = await bar($)
  await ui.press({ key: 'play' })
  const transfer = sent.find(r => r.method === 'PUT' && r.url === `${API}/me/player`)
  expect(JSON.parse(transfer?.body ?? '{}')).toEqual({ device_ids: ['phone'], play: true })
  await ui.unmount()
})

test('no Device to wake: the Bar says to open Spotify for 5 s and keeps its Controls', async ($, on) => {
  const clock = setup(on, {}, LOGGED_IN)
  const { sent } = account(on, { startWithout: true, devices: [] })
  await startSession($, on)
  const ui = await bar($)
  await ui.press({ key: 'play' })
  expect(asked(sent)).not.toContain('PUT /me/player')
  expect(await ui.find({ type: 'Text', text: /Open Spotify/ })).toBeDefined()
  expect(await ui.find({ key: 'play' })).toBeDefined()
  await clock.advance(5_000)
  expect(await ui.find({ type: 'Text', text: /Open Spotify/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Nothing playing/ })).toBeDefined()
  await ui.unmount()
})

test('a transfer Spotify refuses says the same', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  account(on, { startWithout: true, transfer: 404 })
  await startSession($, on)
  const ui = await bar($)
  await ui.press({ key: 'play' })
  expect(await ui.find({ type: 'Text', text: /Open Spotify/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' ▶' })).toBeDefined()
  await ui.unmount()
})

test('other Controls with no Device send nothing and point to ▶', async ($, on) => {
  setup(on, {}, LOGGED_IN)
  const { sent } = account(on, { startWithout: true })
  await startSession($, on)
  const ui = await bar($)
  const from = sent.length
  await ui.press({ key: 'next' })
  await ui.press({ key: 'shuffle' })
  expect(asked(sent.slice(from)).filter(r => !r.startsWith('GET /me/player?'))).toEqual([])
  expect(await ui.find({ type: 'Text', text: /press ▶/i })).toBeDefined()
  await ui.unmount()
})

test('/hum-demo no-device keeps the Bar, and ▶ wakes the demo Device', async ($, on) => {
  setup(on)
  await startSession($, on)
  await demo($)
  await demo($, 'no-device')
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Muddy Feet/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' ▶' })).toBeDefined()
  await ui.press({ key: 'play' })
  expect(await ui.find({ type: 'Text', text: '❚❚' })).toBeDefined()
  await ui.unmount()
})
