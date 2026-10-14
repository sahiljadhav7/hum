# CLAUDE.md

hum is a Claude Code plugin (a "mod") that draws a Spotify player Bar under Claude Code's prompt, with clickable controls. It talks to Spotify only through the Web API, using each user's own Developer app (Premium required).

Read before changing behaviour:
- `CONTEXT.md`: the glossary. Use its terms in code, tests and docs (Bar, Look, Seek bar, Volume icon, Idle state, Demo mode, …) and avoid the ones it lists to avoid.
- `DESIGN.md`: what the Bar looks like and how it behaves, the commands, the three Looks with exact colors.
- `docs/adr/`: decisions already made. Don't reopen them silently; propose a new ADR instead.
- `.scratch/hum/issues/`: the work, one markdown file per issue (see `AGENTS.md` for the tracker and labels).

## Commands

```sh
claude --plugin-dir .          # run Claude Code with hum loaded (needs the `.`)
claude plugin test .           # all tests/*.test.tsx
claude plugin validate .       # what the engine would refuse
tsc -p .                       # type-check; needs .claude-plugin/types/, written when Claude Code loads the plugin
```

`tsconfig.json` only extends that generated file. Until Claude Code has loaded the plugin, editors show "Cannot use JSX" (restart the TS server once it exists).

Run all three checks before calling work done. `/hum-demo` inside Claude Code gives a fake Spotify for trying things without an account.

## Layout

- `hooks/register.tsx`: the only module that receives `$`. Hooks, commands, polling, the Web API client, login and token refresh.
- `hooks/player.ts`: Now playing, Commands, the Idle hints, and `stopped()` (no Device: keep the last track paused). Pure.
- `hooks/spotify.ts`: Web API calls (player, playlists, devices) and parsers for Spotify's replies. Pure.
- `hooks/demo.ts`: Demo mode, a fake Web API answering in Spotify's JSON. Pure.
- `hooks/auth.ts`: PKCE, the authorize URL, redirect and token parsing, the node helper script. Pure.
- `hooks/picker.tsx`: draws the Playlist picker (`/hum-playlist`). Pure.
- `hooks/bar/`: drawing. `draw.tsx` (layouts), `look.ts` (palettes, widths), `pixels.ts` (kitty images), `seek.tsx` (Client module for the Seek bar).
- `types/index.d.ts`: the plugin's state contract. It can't import, so it restates some types.
- `tests/`: `helpers.ts` plus one file per area.

## Platform rules (the engine enforces these, or they bite at runtime)

- `$` may only be passed to top-level function declarations in the same file. Keep `$` in `register.tsx`; keep other modules pure.
- Client props must not contain `undefined`.
- Hover needs a keyed `Box`. Plain clicks only reach plugins in the fullscreen layout.
- Without `COLORTERM=truecolor`, Claude Code rounds colors to the 256-color palette; every Look needs a graphite palette for that case.
- No toasts or popups on clicks. The Bar itself shows the result.
- Under WSL the browser opens with `wslview`, then PowerShell `Start-Process`. Not `explorer.exe`: it opens File Explorer for long URLs.
- Claude Code shows a command's reply after the plugin's name, so replies never start with `hum: `. Hints and notes hum draws itself keep it.
- Handlers interleave across `await` (a second click runs while the first waits on Spotify). Drop stale replies: compare a counter (`latestPoll`, `latestOpen`) or the state the request started from.
- `Button` children may only be strings and `Text`, so columns are padded by hand with `cells()`/`fit()` (they count emoji and CJK as 2 columns).

## Testing

- TDD at seams agreed with the user: the mounted Bar and its commands (`$.ui.mount`), the HTTP boundary (`api.spotify.com`, `accounts.spotify.com`) and host commands (`process.run` / `process.spawn`). Don't test internals.
- Stand-ins go through `on('http.fetch' | 'process.run' | 'process.spawn' | 'store.set' | …)` and must return `{ value: … }`. A stand-in can't be replaced inside one test; split the test instead.
- `$.store.get` isn't available to tests; record writes with a `store.set` stand-in.
- Expected values come from Spotify's docs or worked examples, never recomputed the way the code does.
- `ui.find({ text: 'string' })` ignores trailing spaces; check padding with an anchored regex (`/^name {43}$/u`).
- To test a race, hold a reply in an `async` `http.fetch` stand-in on a promise, leave the first `ui.press` unawaited, then release.
- Panes: mount with `component: 'Pane'` and its `requestId`; record `ui.open` / `ui.close` with stand-ins.

## Spotify gotchas

- Since March 2026, Development Mode apps use `GET /playlists/{id}/items` (entries' `item`, not `track`), and only playlists the user owns or collaborates on return their items.
- PC Spotify players may refuse remote (Connect) commands behind a VPN or firewall. Do hand checks with a phone as the Device.

## Working style

- **Think first.** State assumptions; if a request has more than one reading, ask. Push back when something simpler exists.
- **Simplicity.** Only what the issue asks. No speculative options, abstractions or error handling for impossible cases.
- **Surgical changes.** Touch only what the task needs and match the surrounding style. Mention unrelated problems rather than fixing them.
- **Verify.** Turn each task into a check: a failing test, then the fix, then the full suite, validate and `tsc`.
- When an issue is done, fill in its `## Answer`, update its `Status`, and keep README's roadmap and DESIGN.md in step.

## Commits and PRs

- Commit and push only when the user asks.
- No `Co-Authored-By: Claude` line (or any other Claude attribution) in commit messages or PR descriptions.
