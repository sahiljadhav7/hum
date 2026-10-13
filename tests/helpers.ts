// Shared test helpers: the world beneath the plugin (clock, environment,
// store, session, Spotify) and reads of the mounted Bar.
import { mock } from 'claude-code/testing'

export const under = (columns = 100) => ({
  component: 'PromptHint',
  props: { isDraft: false, isWorking: false, hint: '? for shortcuts' },
  viewport: { columns, rows: 24, isFullscreen: true },
})

/** The world beneath the plugins: a clock at 1 s, this environment, an empty store (unless given). */
export function setup(on: any, env: Record<string, string> = {}, store: Record<string, unknown> = {}) {
  const clock = mock.clock(on, { now: 1_000 })
  mock.env(on, env)
  mock.store(on, store)
  return clock
}

/** Starts a session, answering beneath the plugins as the engine would. */
export async function startSession($: any, on: any) {
  on('session.start', (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal' })
}

export async function bar($: any, columns = 100) {
  return (await $.ui.mount({ plugin: 'hum', surface: 'terminal', ...under(columns) })) as any
}

/** Runs a slash command and returns the text it answered. */
export const run = async ($: any, command: string, args = '') =>
  ((await $.command.run({ command, args })) as { text: string }).text

/** Turns Demo mode on (optionally with a simulation, e.g. 'no-device'). */
export const demo = async ($: any, args = '') => run($, 'hum-demo', args)

export const style = async ($: any, args: string) => run($, 'hum-style', args)

export const seekTexts = async (ui: any) =>
  (await ui.findAll({ type: 'Text', in: 'seek' })).map((t: any) => t.text as string)

export const countdownOf = async (ui: any) => (await seekTexts(ui)).find((t: string) => /-\d+:\d\d/.test(t))?.trim()

export const lineCells = async (ui: any) => (await seekTexts(ui)).filter((t: string) => /^[━╸─▁]$/.test(t)).length

/** A request hum sent to Spotify, as a test standing in for api.spotify.com saw it. */
export type Sent = { method: string; url: string; headers: Record<string, string>; body?: string }

/**
 * Stands in for api.spotify.com beneath the plugin. `answer` gets each request
 * and returns the response; every request is recorded in `sent`.
 */
export function spotify(on: any, answer: (req: Sent) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  const sent: Sent[] = []
  on('http.fetch', (_$: unknown, e: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }) => {
    const req: Sent = { method: e.init?.method ?? 'GET', url: e.url, headers: e.init?.headers ?? {}, body: e.init?.body }
    sent.push(req)
    const res = answer(req)
    const text = res.body === undefined ? '' : JSON.stringify(res.body)
    return { value: { status: res.status, ok: res.status >= 200 && res.status < 300, headers: res.headers ?? {}, text } }
  })
  return sent
}

/** A `GET /v1/me/player` body, as Spotify sends it. */
export function playerBody(over: Partial<{
  name: string
  artists: string[]
  durationMs: number
  progressMs: number
  isPlaying: boolean
  shuffle: boolean
  repeat: 'off' | 'context' | 'track'
  volume: number
  supportsVolume: boolean
}> = {}) {
  const o = {
    name: 'Espresso', artists: ['Sabrina Carpenter'], durationMs: 175_000, progressMs: 60_000, isPlaying: true,
    shuffle: false, repeat: 'off' as const, volume: 70, supportsVolume: true, ...over,
  }
  return {
    device: { id: 'd1', is_active: true, name: 'Desktop', type: 'Computer', volume_percent: o.volume, supports_volume: o.supportsVolume },
    shuffle_state: o.shuffle,
    repeat_state: o.repeat,
    progress_ms: o.progressMs,
    is_playing: o.isPlaying,
    currently_playing_type: 'track',
    item: {
      id: 't1',
      name: o.name,
      duration_ms: o.durationMs,
      artists: o.artists.map(name => ({ name })),
      album: { id: 'a1', name: 'Album', images: [{ url: 'https://i.scdn.co/image/a1', width: 64, height: 64 }] },
    },
  }
}
