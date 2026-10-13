# hum is a Claude Code plugin, not a standalone terminal app

hum is a Claude Code plugin whose hooks module draws the Bar in Claude Code's own UI, on the row under the prompt, and registers the `/hum-*` commands. `idea.md` planned a separate TUI in a tmux pane that also ran without Claude Code. That plan was dropped because hum should appear in any terminal wherever the plugin is installed, with no tmux, and the plugin UI already supports clicks, images, timers and HTTP.

## Considered Options

- **Standalone TUI (terminal-kit/neo-blessed) in a tmux pane opened by a SessionStart hook**: needs tmux, has no place in terminals without splits, and makes Claude Code's status line and the Bar separate programs.
- **Status line only**: text only, no clicks.

## Consequences

- hum only runs inside Claude Code. There's no standalone binary.
- The Bar replaces Claude Code's hint line under the prompt (`esc to interrupt`, `? for shortcuts`), and it is one row high.
- Prototype 1 (2026-10-13) confirmed that the row under the prompt accepts plain clicks. The plugin API only delivers clicks in Claude Code's fullscreen layout.
- The Cover shows real pixels only in terminals the plugin UI supports images in (kitty, Ghostty). Everywhere else it falls back to colored cells.
