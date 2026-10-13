# Prototypes (throwaway)

Code here answered a question and is kept as a primary source. It is not hum.

- `01-bar-clicks-and-look/`: a fake-player mod.
  - Q: does the row under Claude Code's prompt take plain clicks and drags? A: yes, in the fullscreen layout.
  - Q: which look? All three ship: Glossy (default), Minimal, Glass, switched with `/hum-style`. Spotify, shadcn, Glow and Mono were tried and dropped.
  - Run: `claude --plugin-dir prototypes/01-bar-clicks-and-look`, then `/hum-proto` (placement) and `/hum-proto style` (look).

The prototype's tests are named `*.proto-tests.tsx` so that `claude plugin test .` at the repo root (hum's own tests) doesn't pick them up. To run them, copy the prototype folder elsewhere, rename the file back to `*.test.tsx`, and run `claude plugin test` there.
