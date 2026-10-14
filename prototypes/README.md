# Prototypes (throwaway)

Code here answered a question and is kept as a primary source. It is not hum.

- `01-bar-clicks-and-look/`: a fake-player mod.
  - Q: does the row under Claude Code's prompt take plain clicks and drags? A: yes, in the fullscreen layout.
  - Q: which look? All three ship: Glossy (default), Minimal, Glass, switched with `/hum-style`. Spotify, shadcn, Glow and Mono were tried and dropped.
  - Run: `claude --plugin-dir prototypes/01-bar-clicks-and-look`, then `/hum-proto` (placement) and `/hum-proto style` (look).
- `02-cover/`: real Spotify covers, decoded and drawn (issue 04).
  - Q: can a plugin decode a cover JPEG without Node? A: yes, with jpeg-js vendored (41 KB, about 1 ms per 64 px cover). But `$.http.fetch` mangles binary bodies, so the bytes come from `curl -o` plus `$.fs.read(…, { as: 'bytes' })`.
  - Q: the Cover where images can't be drawn? A: `▀` half-blocks, 2 cells by 1 row, in every Look, with or without truecolor.
  - Later: built in issue 05, then the Cover was dropped entirely ([ADR 0004](../docs/adr/0004-drop-the-cover.md)).
  - Run: `claude --plugin-dir prototypes/02-cover`, then `/hum-cover` (next cover) and `/hum-cover glass` (the Glass card candidates).

The prototype's tests are named `*.proto-tests.tsx` so that `claude plugin test .` at the repo root (hum's own tests) doesn't pick them up. To run them, copy the prototype folder elsewhere, rename the file back to `*.test.tsx`, and run `claude plugin test` there.
