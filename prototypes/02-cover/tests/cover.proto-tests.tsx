// PROTOTYPE check: the mod decodes a real 64 px cover (Blinding Lights) and
// mounts a tree the engine accepts. Run it as prototypes/README.md says.
import { expect, mock, test } from 'claude-code/testing'

const JPEG = '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'

test('the row under the prompt shows the decoded Cover as Rasters and an Image', async ($: any, on: any) => {
  const clock = mock.clock(on, { now: 1_000 })
  mock.env(on, {})
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
  on('fs.read', () => ({ value: { base64: JPEG } }))
  on('session.start', (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal' })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'hum-cover-proto', surface: 'terminal', component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: '' }, viewport: { columns: 200, rows: 24, isFullscreen: true } })
  expect(await ui.find({ type: 'Text', text: 'Blinding Lights' })).toBeDefined()
  const r2 = await ui.find({ key: 'r2' })
  const cells = (Uint8Array as any).fromBase64(r2.props.cells) as Uint8Array
  expect(cells.length).toBe(2 * 3 * 4)
  expect(new DataView(cells.buffer).getUint32(0, true)).toBe(0x2580)
  expect((await ui.find({ key: 'img' })).props.source.width).toBe(64)
  expect(await ui.find({ type: 'Text', text: /2664 B 64×64 via curl/ })).toBeDefined()
  expect(await $.command.run({ command: 'hum-cover', args: 'glass' })).toEqual({ text: 'hum-cover: glass view' })
  await clock.settle()
  expect((await ui.find({ key: 'g4' })).props.rows).toBe(2)
  expect(await ui.find({ type: 'Text', text: 'B: swatch (average)' })).toBeDefined()
  await ui.unmount()
})
