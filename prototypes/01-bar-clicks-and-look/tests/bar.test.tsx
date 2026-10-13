import { expect, mock, test } from 'claude-code/testing'

const HINT = { component: 'PromptHint', props: { isDraft: false, isWorking: false, hint: '? for shortcuts' } } as const
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const
const at = (columns: number) => ({ ...HINT, viewport: { columns, rows: 24, isFullscreen: true } })

// The order /hum-proto style cycles through; the first is the default.
const ORDER = ['glossy', 'minimal', 'glass']
async function useLook($: any, name: string) {
  for (let i = 0; i < ORDER.indexOf(name); i++) await $.command.run({ command: 'hum-proto', args: 'style' })
}
const mount = async ($: any, columns = 100) =>
  (await $.ui.mount({ plugin: 'hum-proto', surface: 'terminal', ...at(columns) } as never)) as any

test('style cycles Glossy → Minimal → Glass → Glossy', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, {})
  const names: string[] = []
  for (let i = 0; i < 3; i++) names.push(((await $.command.run({ command: 'hum-proto', args: 'style' } as never)) as any).text)
  expect(names).toEqual(['hum-proto look: Minimal', 'hum-proto look: Glass', 'hum-proto look: Glossy'])
})

test('every look draws, presses and seeks', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, {})
  for (const name of ORDER) {
    const ui = await mount($)
    expect(await ui.find({ type: 'Text', text: /Muddy Feet/ })).toBeDefined()
    await ui.press({ key: 'shuffle' })
    await ui.press({ key: 'repeat' })
    await ui.press({ key: 'volume' })
    expect(await ui.find({ type: 'Text', text: '◁× ' })).toBeDefined()
    await ui.press({ key: 'volume' })
    await ui.pointer({ type: 'down', x: 4, y: 0, button: 'left', in: 'seek' })
    await ui.pointer({ type: 'up', x: 4, y: 0, button: 'left', in: 'seek' })
    await ui.drawn({ in: 'seek' })
    await ui.press({ key: 'next' })
    expect(await ui.find({ type: 'Text', text: /Flowers/ })).toBeDefined()
    await ui.press({ key: 'prev' })
    await ui.unmount()
    await $.command.run({ command: 'hum-proto', args: 'style' } as never)
    expect(name.length).toBeGreaterThan(0)
  }
})

test('the Bar also draws in the band after /hum-proto', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, {})
  await $.command.run({ command: 'hum-proto' } as never)
  const ui = (await $.ui.mount({ plugin: 'hum-proto', surface: 'terminal', ...BAND } as never)) as any
  await ui.press({ key: 'play' })
  expect(await ui.find({ type: 'Text', text: /press pause/ })).toBeDefined()
  await ui.unmount()
})

test('glossy (default) with truecolor: warm two-tone capsule, square ends', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, { COLORTERM: 'truecolor' })
  const ui = await mount($)
  const tree = JSON.stringify(await ui.drawn())
  expect(tree.includes('#7A695B')).toBe(true)
  expect(tree.includes('#68584B')).toBe(true)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(JSON.stringify(await ui.drawn({ in: 'seek' })).includes('#68584B')).toBe(true)
  await ui.unmount()
})

test('glossy without truecolor: exact 256-color graphite', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, {})
  const ui = await mount($)
  const tree = JSON.stringify(await ui.drawn())
  expect(tree.includes('#585858')).toBe(true)
  expect(tree.includes('#7A695B')).toBe(false)
  await ui.unmount()
})

test('glossy in kitty: smooth image ends and a real Cover', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1', COLORTERM: 'truecolor' })
  const ui = await mount($)
  expect((await ui.find({ key: 'cap-l' }))?.type).toBe('Image')
  expect((await ui.find({ key: 'cap-r' }))?.type).toBe('Image')
  expect((await ui.find({ key: 'cover' }))?.type).toBe('Image')
  await ui.unmount()
})

test('minimal: no backgrounds, smooth progress without a knob, fixed 7-cell countdown', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, {})
  await useLook($, 'minimal')
  const ui = await mount($)
  expect(JSON.stringify(await ui.drawn()).includes('backgroundColor')).toBe(false)
  const seek = await ui.findAll({ type: 'Text', in: 'seek' })
  expect(seek.some((t: any) => t.text === '●')).toBe(false)
  const time = seek.map((t: any) => t.text).find((t: string) => /-\d+:\d\d/.test(t))
  expect(time.length).toBe(7)
  await ui.unmount()
})

test('narrow drops the right-hand icons first (Glossy, Minimal, Glass)', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, {})
  for (const name of ORDER) {
    const ui = await mount($, 38)
    expect(await ui.find({ key: 'play' })).toBeDefined()
    expect(await ui.find({ key: 'shuffle' })).toBeUndefined()
    await ui.unmount()
    await $.command.run({ command: 'hum-proto', args: 'style' } as never)
    expect(name.length).toBeGreaterThan(0)
  }
})

test('glass in Windows Terminal: flat, no images, no stair-step caps', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, {})
  await useLook($, 'glass')
  const ui = await mount($)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect((await ui.find({ key: 'cover' }))?.type).toBe('Box')
  expect(await ui.find({ type: 'Text', text: /[▗▐▝▖▌▘]/ })).toBeUndefined()
  await ui.unmount()
})

test('glass in kitty: image caps and Cover', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' })
  await useLook($, 'glass')
  const ui = await mount($)
  expect((await ui.find({ key: 'cap-l' }))?.type).toBe('Image')
  expect((await ui.find({ key: 'cover' }))?.type).toBe('Image')
  await ui.unmount()
})

test('glass in kitty through tmux: no images', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1', TMUX: '/tmp/tmux-1000/default,1,0' })
  await useLook($, 'glass')
  const ui = await mount($)
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})

test('NO_COLOR: Minimal with no colors at all, whatever the chosen look', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, { NO_COLOR: '1' })
  for (const name of ORDER) {
    const ui = await mount($)
    const tree = JSON.stringify(await ui.drawn())
    expect(tree.includes('"color"') || tree.includes('backgroundColor')).toBe(false)
    expect(await ui.find({ type: 'Text', text: /Muddy Feet/ })).toBeDefined()
    await ui.unmount()
    await $.command.run({ command: 'hum-proto', args: 'style' } as never)
    expect(name.length).toBeGreaterThan(0)
  }
})

test('glass without truecolor: graphite, no olive or pink', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, {})
  await useLook($, 'glass')
  const ui = await mount($)
  const tree = JSON.stringify(await ui.drawn())
  expect(tree.includes('#4E4E4E')).toBe(true)
  for (const brown of ['#6A594C', '#4A3D33', '#B7ABA0']) expect(tree.includes(brown)).toBe(false)
  await ui.unmount()
})

test('glass with truecolor: warm browns', async ($, on) => {
  mock.clock(on, { now: 1_000 })
  mock.env(on, { COLORTERM: 'truecolor' })
  await useLook($, 'glass')
  const ui = await mount($)
  expect(JSON.stringify(await ui.drawn()).includes('#6A594C')).toBe(true)
  await ui.unmount()
})
