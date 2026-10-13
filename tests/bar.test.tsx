// hum's Bar, tested only at its seam: mounted under the prompt as Claude Code
// draws it, acted on by key (presses, pointer, commands), with the clock,
// store and environment mocked.
import { expect, mock, test } from 'claude-code/testing'

const under = (columns = 100) => ({
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  viewport: { columns, rows: 24, isFullscreen: true },
})

/** The world beneath the plugins: a clock at 1 s, this environment, an empty store (unless given). */
function setup(on: any, env: Record<string, string> = {}, store: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: 1_000 })
  mock.env(on, env)
  mock.store(on, store)
  return clock
}

/** Starts a session, answering beneath the plugins as the engine would. */
async function startSession($: any, on: any) {
  on('session.start', (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal' })
}

async function bar($: any, columns = 100) {
  return (await $.ui.mount({ plugin: 'hum', surface: 'terminal', ...under(columns) })) as any
}

test('the Bar draws under the prompt with the track and its artist', async ($, on) => {
  setup(on, {})
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Muddy Feet \(feat Sia\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Miley Cyrus, Sia/ })).toBeDefined()
  expect(await ui.find({ key: 'play' })).toBeDefined()
  await ui.unmount()
})

const seekTexts = async (ui: any) => (await ui.findAll({ type: 'Text', in: 'seek' })).map((t: any) => t.text as string)
const countdownOf = async (ui: any) => (await seekTexts(ui)).find((t: string) => /-\d+:\d\d/.test(t))?.trim()

test('play/pause flips between ❚❚ and ▶ and freezes the countdown', async ($, on) => {
  const clock = setup(on, {})
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: '❚❚' })).toBeDefined()
  await ui.press({ key: 'play' })
  expect(await ui.find({ type: 'Text', text: ' ▶' })).toBeDefined()
  const frozen = await countdownOf(ui)
  await clock.advance(10_000)
  expect(await countdownOf(ui)).toBe(frozen)
  await ui.unmount()
})

test('next and previous move between tracks; previous after 3 s restarts the track', async ($, on) => {
  const clock = setup(on, {})
  const ui = await bar($)
  await ui.press({ key: 'next' })
  expect(await ui.find({ type: 'Text', text: /Flowers/ })).toBeDefined()
  await ui.press({ key: 'prev' })
  expect(await ui.find({ type: 'Text', text: /Muddy Feet/ })).toBeDefined()
  await clock.advance(10_000) // 10 s into Muddy Feet (3:49)
  await ui.press({ key: 'prev' })
  expect(await ui.find({ type: 'Text', text: /Muddy Feet/ })).toBeDefined()
  expect(await countdownOf(ui)).toBe('-3:49')
  await ui.unmount()
})

test('clicking the Seek bar seeks there', async ($, on) => {
  setup(on, {})
  const ui = await bar($) // 100 columns: a 24-cell line
  await ui.pointer({ type: 'down', x: 11, y: 0, button: 'left', in: 'seek' })
  await ui.pointer({ type: 'up', x: 11, y: 0, button: 'left', in: 'seek' })
  // 11.5 / 24 of 3:49 is 1:49.7 in, so 1:59 left.
  expect(await countdownOf(ui)).toBe('-1:59')
  await ui.unmount()
})

test('the speaker mutes, then restores the volume', async ($, on) => {
  setup(on, {})
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: '◁))' })).toBeDefined()
  await ui.press({ key: 'volume' })
  expect(await ui.find({ type: 'Text', text: '◁× ' })).toBeDefined()
  await ui.press({ key: 'volume' })
  expect(await ui.find({ type: 'Text', text: '◁))' })).toBeDefined()
  await ui.unmount()
})

test('shuffle and repeat show when on (bold + underline); repeat cycles off, all, one', async ($, on) => {
  setup(on, {})
  const ui = await bar($)
  const style = async (key: string) => (await ui.find({ key }))?.children?.[0]?.props ?? {}
  expect((await style('shuffle')).underline).toBeUndefined()
  await ui.press({ key: 'shuffle' })
  expect((await style('shuffle')).underline).toBe(true)
  await ui.press({ key: 'repeat' })
  expect((await style('repeat')).underline).toBe(true)
  expect(await ui.find({ type: 'Text', text: '↻ ' })).toBeDefined()
  await ui.press({ key: 'repeat' })
  expect(await ui.find({ type: 'Text', text: '↻¹' })).toBeDefined()
  await ui.press({ key: 'repeat' })
  expect((await style('repeat')).underline).toBeUndefined()
  await ui.unmount()
})

test('narrow: the right-hand icons drop first, the controls stay', async ($, on) => {
  setup(on, {})
  const ui = await bar($, 38)
  expect(await ui.find({ key: 'play' })).toBeDefined()
  expect(await ui.find({ key: 'shuffle' })).toBeUndefined()
  await ui.unmount()
})

test('Glossy without truecolor uses exact 256-color greys; with truecolor, warm browns', async ($, on) => {
  setup(on, {})
  const ui = await bar($)
  const tree = JSON.stringify(await ui.drawn())
  expect(tree).toContain('#585858')
  expect(tree).toContain('#444444')
  expect(tree).not.toContain('#7A695B')
  await ui.unmount()
})

test('Glossy with truecolor is the warm two-tone capsule, square ends in Windows Terminal', async ($, on) => {
  setup(on, { COLORTERM: 'truecolor' })
  const ui = await bar($)
  const tree = JSON.stringify(await ui.drawn())
  expect(tree).toContain('#7A695B')
  expect(tree).toContain('#68584B')
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})

test('in kitty the capsule ends and the Cover are pictures; not through tmux', async ($, on) => {
  setup(on, { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1', COLORTERM: 'truecolor' })
  const ui = await bar($)
  expect((await ui.find({ key: 'cap-l' }))?.type).toBe('Image')
  expect((await ui.find({ key: 'cap-r' }))?.type).toBe('Image')
  expect((await ui.find({ key: 'cover' }))?.type).toBe('Image')
  await ui.unmount()
})

test('through tmux there are no pictures, even in kitty', async ($, on) => {
  setup(on, { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1', TMUX: '/tmp/tmux-1000/default,1,0' })
  const ui = await bar($)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})

test('NO_COLOR draws no colors at all', async ($, on) => {
  setup(on, { NO_COLOR: '1', COLORTERM: 'truecolor' })
  const ui = await bar($)
  const tree = JSON.stringify(await ui.drawn())
  expect(tree).not.toContain('"color"')
  expect(tree).not.toContain('backgroundColor')
  expect(await ui.find({ type: 'Text', text: /Muddy Feet/ })).toBeDefined()
  await ui.unmount()
})

const style = async ($: any, args: string) =>
  ((await $.command.run({ command: 'hum-style', args })) as { text: string }).text

test('/hum-style glass switches to the Glass look', async ($, on) => {
  setup(on, {})
  await startSession($, on)
  expect(await style($, 'glass')).toMatch(/Glass/)
  const ui = await bar($)
  expect(await ui.find({ key: 'card' })).toBeDefined() // Glass's inset card
  await ui.unmount()
})

test('/hum-style with no look names the current one and the choices', async ($, on) => {
  setup(on)
  await startSession($, on)
  expect(await style($, '')).toBe('hum look: Glossy. Choices: Glossy, Minimal, Glass.')
})

test('/hum-style rejects an unknown look and keeps the current one', async ($, on) => {
  setup(on)
  await startSession($, on)
  expect(await style($, 'neon')).toBe('hum: no look called "neon". Choices: Glossy, Minimal, Glass.')
  expect(await style($, '')).toMatch(/^hum look: Glossy\./)
})

test('the look chosen in an earlier session is used', async ($, on) => {
  setup(on, {}, { style: 'minimal' })
  const ui = await bar($)
  // Minimal paints no background anywhere.
  expect(JSON.stringify(await ui.drawn())).not.toContain('backgroundColor')
  expect(await ui.find({ type: 'Text', text: /Muddy Feet/ })).toBeDefined()
  await ui.unmount()
})

test('/hum-style saves the look for later sessions', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, {})
  // Stand in for the store, recording what hum saves.
  const saved: Record<string, unknown> = {}
  on('store.get', (_$: unknown, e: { key: string }) => ({ value: saved[e.key] }))
  on('store.set', (_$: unknown, e: { key: string; value: unknown }) => {
    saved[e.key] = e.value
    return { value: undefined }
  })
  await startSession($, on)
  await style($, 'minimal')
  expect(saved.style).toBe('minimal')
})

test('when a track ends, the next one plays', async ($, on) => {
  const clock = setup(on)
  await startSession($, on)
  const ui = await bar($)
  await clock.advance(230_000) // Muddy Feet is 3:49
  expect(await ui.find({ type: 'Text', text: /Flowers/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '❚❚' })).toBeDefined()
  await ui.unmount()
})

test('a new session starts the first track from the beginning, whatever the time', async ($, on) => {
  mock.clock(on, { now: 1_760_000_000_000 }) // a real-world clock (Oct 2025)
  mock.env(on, {})
  mock.store(on)
  await startSession($, on)
  const ui = await bar($)
  expect(await ui.find({ type: 'Text', text: /Muddy Feet/ })).toBeDefined()
  expect(await countdownOf(ui)).toBe('-3:49')
  await ui.unmount()
})

test('with repeat one, a finished track plays again', async ($, on) => {
  const clock = setup(on)
  await startSession($, on)
  const ui = await bar($)
  await ui.press({ key: 'repeat' }) // all
  await ui.press({ key: 'repeat' }) // one
  await clock.advance(230_000)
  expect(await ui.find({ type: 'Text', text: /Muddy Feet/ })).toBeDefined()
  expect(await countdownOf(ui)).toMatch(/^-3:4\d$/)
  await ui.unmount()
})

test('with repeat off, playback stops after the last track', async ($, on) => {
  const clock = setup(on)
  await startSession($, on)
  const ui = await bar($)
  await ui.press({ key: 'next' })
  await ui.press({ key: 'next' }) // Midnight City, 4:03, the last track
  await clock.advance(250_000)
  expect(await ui.find({ type: 'Text', text: /Midnight City/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' ▶' })).toBeDefined()
  await ui.unmount()
})

test('Glass in Windows Terminal: flat capsule, an inset card, no pictures or stair-step ends', async ($, on) => {
  setup(on, {}, { style: 'glass' })
  const ui = await bar($)
  expect(await ui.find({ key: 'card' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Miley Cyrus, Sia/ })).toBeDefined()
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect((await ui.find({ key: 'cover' }))?.type).toBe('Box') // a solid swatch
  expect(await ui.find({ type: 'Text', text: /[▗▐▝▖▌▘]/ })).toBeUndefined()
  // Without truecolor: graphite, not browns that round to olive and pink.
  const tree = JSON.stringify(await ui.drawn())
  expect(tree).toContain('#4E4E4E')
  expect(tree).not.toContain('#6A594C')
  await ui.unmount()
})

test('Glass in kitty: smooth picture ends and a picture Cover', async ($, on) => {
  setup(on, { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1', COLORTERM: 'truecolor' }, { style: 'glass' })
  const ui = await bar($)
  expect((await ui.find({ key: 'cap-l' }))?.type).toBe('Image')
  expect((await ui.find({ key: 'cover' }))?.type).toBe('Image')
  await ui.unmount()
})

for (const look of ['glossy', 'minimal', 'glass']) {
  test(`${look}: controls keep working at a narrow width`, async ($, on) => {
    setup(on, {}, { style: look })
    const ui = await bar($, 38)
    await ui.press({ key: 'next' })
    expect(await ui.find({ type: 'Text', text: /Flowers/ })).toBeDefined()
    expect(await ui.find({ key: 'shuffle' })).toBeUndefined()
    await ui.unmount()
  })
}

test('the Bar stays while Claude is working', async ($, on) => {
  setup(on)
  const working = { ...under(), props: { isDraft: false, isWorking: true, hint: 'esc to interrupt' } }
  const ui = (await $.ui.mount({ plugin: 'hum', surface: 'terminal', ...working } as never)) as any
  expect(await ui.find({ key: 'play' })).toBeDefined()
  await ui.unmount()
})

const lineCells = async (ui: any) =>
  (await seekTexts(ui)).filter((t: string) => /^[━╸─▁]$/.test(t)).length

test('Glossy: the icons drop before the Seek bar shrinks', async ($, on) => {
  setup(on)
  // Glossy in Windows Terminal needs 63 columns for icons plus a full 24-cell Seek bar.
  let ui = await bar($, 63)
  expect(await ui.find({ key: 'shuffle' })).toBeDefined()
  expect(await lineCells(ui)).toBe(24)
  await ui.unmount()
  ui = await bar($, 62)
  expect(await ui.find({ key: 'shuffle' })).toBeUndefined()
  expect(await lineCells(ui)).toBe(24)
  await ui.unmount()
})

test('Glass: the icons drop before the title area shrinks', async ($, on) => {
  setup(on, {}, { style: 'glass' })
  // Glass in Windows Terminal needs 72 columns for icons plus a full 30-cell title area.
  let ui = await bar($, 72)
  expect(await ui.find({ key: 'shuffle' })).toBeDefined()
  expect(await lineCells(ui)).toBe(35) // the card's line spans the Cover and title: 5 + 30
  await ui.unmount()
  ui = await bar($, 71)
  expect(await ui.find({ key: 'shuffle' })).toBeUndefined()
  expect(await lineCells(ui)).toBe(35)
  await ui.unmount()
})

test('clicking the countdown does not seek', async ($, on) => {
  setup(on)
  const ui = await bar($) // a 24-cell Seek bar; the countdown starts at cell 24
  await ui.pointer({ type: 'down', x: 26, y: 0, button: 'left', in: 'seek' })
  await ui.pointer({ type: 'up', x: 26, y: 0, button: 'left', in: 'seek' })
  expect(await countdownOf(ui)).toMatch(/^-3:4\d$/)
  await ui.unmount()
})

test('NO_COLOR in kitty draws no picture either', async ($, on) => {
  setup(on, { NO_COLOR: '1', TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1', COLORTERM: 'truecolor' })
  const ui = await bar($)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})
