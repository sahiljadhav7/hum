# hum: design

hum is a Claude Code plugin. It draws a Spotify Bar under Claude Code's prompt, with the track's title and artist, clickable playback Controls, a Seek bar, a Volume icon and the Cover. Terms are defined in [CONTEXT.md](CONTEXT.md). The key decisions are recorded in [ADR 0001](docs/adr/0001-spotify-web-api-only.md) (Web API only) and [ADR 0002](docs/adr/0002-claude-code-plugin-not-standalone.md) (Claude Code plugin, not a standalone app).

This document replaces the tmux, standalone, and title/artist plan in `idea.md`.

## Shape

- A Claude Code plugin (a mod: a plugin with a hooks module that draws UI), installed with `/plugin install`.
- Written in TypeScript. It runs only inside Claude Code, in any terminal, without tmux.
- The Bar takes the place of Claude Code's hint line under the prompt (`esc to interrupt`, `? for shortcuts`). It shows even while Claude is working.

## The Bar

**Decided 2026-10-13: hum ships all three looks**, **Glossy** (the default), **Minimal** and **Glass**. Users switch with `/hum-style`, and the choice is remembered across sessions. In the prototype, `/hum-proto style` cycles through them. Each is described in its own section below. What they share:

- **Title and artist are shown.** This reverses the earlier "no title or artist" decision, after the user supplied a reference screenshot.
- **Controls** `◀◀ ❚❚ ▶▶` (` ▶` when paused), plus `⇄` shuffle, `◁))` volume and `↻` repeat on the right. Plain click.
- **Seek bar**: a thin line you can click to seek. Glossy and Minimal also show a fixed 7-cell countdown (`-1:14`).
- **Volume** is an icon, not a slider: it shows the level (`◁× ` / `◁) ` / `◁))`) and a click mutes or unmutes.
- **Cover**: a real image only where the terminal can draw one (kitty, Ghostty). Glass shows a solid swatch elsewhere; Glossy and Minimal leave it out.
- **Right-aligned.** As the width shrinks, the right-hand icons drop first, then the Seek bar shrinks.
- **Height**: two rows (Glossy, Minimal) or three (Glass). The row under the prompt shows them all (confirmed by a user screenshot).
- **`NO_COLOR`**: Minimal with no colors at all, using only bold, underline and inverse on hover.
- **Idle state**: one dim hint line in place of the Controls, e.g. `hum: run /hum-login` or `hum: no active Spotify device`.
- No keyboard shortcuts in v1, and no popups or toasts when a control is used.

## Spotify

- **Web API only**: hum controls whichever Device is active, including a phone or a speaker.
- Each user creates their own **Developer app** with the redirect URI `http://127.0.0.1:8898/callback`. Premium is required, because the app owner must have it, so free accounts can't use hum.
- hum polls Now playing every 4 s and polls again right after every action. Between polls the Seek bar moves on locally: each redraw places it from the time of the last poll, and between redraws it ticks forward once a second by itself.
- Podcasts: the poll asks for episodes too (`additional_types=episode`) and shows the episode and its show. During an ad the Bar says `hum: ad playing`; with a Device but nothing playing, `hum: nothing playing`.
- An error reply (5xx, 403...) keeps the last Now playing rather than claiming there's no Device.
- After a `429`, hum sends nothing until `Retry-After` has passed. A `401` shows `hum: run /hum-login`, and the refused token isn't sent again (issue 03 refreshes it there first).
- Before `/hum-login` (and with Demo mode off), the Bar is the Idle hint `hum: run /hum-login`.
- Tokens persist across sessions.

## Commands

| Command | Does |
| --- | --- |
| `/hum-login` | Walks the user through creating a Developer app and pasting the client ID. Then it opens the browser for the OAuth PKCE login. A `node` helper on 127.0.0.1:8898 catches the redirect; if `node` isn't available, the user pastes the redirect URL back. |
| `/hum-logout` | Forgets the stored tokens. |
| `/hum-playlist` | Opens a pane listing the user's playlists, then the chosen playlist's tracks. Picking a track plays it on the Active device. |
| `/hum-style` | Switches the look: Glossy (default), Minimal or Glass. With no argument it shows the choices; the choice is remembered across sessions. |
| `/hum-demo` | Turns Demo mode on or off for the session. A fake Web API inside hum answers the real client's requests in Spotify's own JSON, so the client and its parser run end to end. `/hum-demo no-device` and `/hum-demo no-volume` toggle simulations of no Active device and of a Device without remote volume (they turn Demo mode on). |

## Open risk, checked first: **answered, clicks work** (2026-10-13)

The user tested Prototype 1: plain clicks on the Bar under the prompt work in Windows Terminal under WSL2. The Bar stays under the prompt.

The plugin API doesn't say whether the hint line under the prompt accepts clicks and drags. **Prototype 1** checks this. If it doesn't, the Bar moves to the band above the prompt (two rows are possible there) and ADR 0002 gets updated.

Prototype 1 is a throwaway mod at `~/.claude/dev-mods/f7a5cbc0-6eb2-48cb-90a1-739b10d448d0/hum-proto/`, a folder tied to this session. `/hum-proto` switches it between the hint line under the prompt and the band above the prompt. Once there's a verdict, copy the folder into the repo under a throwaway name.

Found while preparing it: the plugin API only delivers plain clicks in Claude Code's **fullscreen** (alternate-screen) layout. Claude Code uses the main screen inside tmux by default, and when `CLAUDE_CODE_NO_FLICKER=0`. On the main screen a click does nothing, so the mouse-driven Bar needs fullscreen.

## Look: Glossy (default)

This is the Minimal layout (below) on a warm frosted capsule, after the user asked for "a glossy background". The goal is a sheen without the pixelated effects Glass had in Windows Terminal.

- **Capsule**: two rows. The title row is `#7A695B` and the controls row is `#68584B`: a lighter top reads as a gloss highlight, and two close tones read as a sheen, not stripes. It has 2 cells of padding inside each end.
- **Ends**: square in Windows Terminal (no stair-stepped `▗▐▝`). In kitty and Ghostty they are smooth anti-aliased half-disc images, 2 cells wide.
- **Text on the capsule** (hex, because the capsule paints its own background, so it looks the same in light and dark themes): title `#F6F1EC` bold, `· artist` `#CBBFB4`, `◀◀ ❚❚ ▶▶` `#F1EBE5`, `⇄ ◁)) ↻` `#C4B8AD` turning bold white on hover, and on = bold white underlined.
- **Progress**: played `━`/`╸` `#F6F1EC` on a `#4B3F35` `─` track, with the countdown in `#CBBFB4`, all on the controls-row color.
- **Cover**: a real image only in kitty and Ghostty, with corners in the capsule color.
- `/hum-proto style` → Minimal gives the same layout with no background.
- **Color depth**: the browns need truecolor. Without `COLORTERM=truecolor` (the default in a WSL shell), Claude Code rounds colors into the xterm 256-color cube. The user's screenshot showed `#7A695B` → grey `#878787` and `#68584B` → olive `#87875F`. hum then switches to a graphite gloss built only from exact grayscale-ramp entries (`#585858` / `#444444`, text `#EEEEEE` / `#BCBCBC`), so nothing shifts. Glass does the same (user, 2026-10-13: "I don't like the pink and green one"): its browns rounded to olive green and its beige artist text to pink. Without truecolor it uses graphite too (`#4E4E4E` capsule, `#3A3A3A` card, a grey Cover swatch).

## Look: Minimal

The user asked for "smooth and minimalist" after Glass. Filled backgrounds are what read as blocky and pixelated in a terminal, so Minimal has none.

```
                          Muddy Feet (feat Sia) · Miley Cyrus, Sia
  ◀◀  ❚❚  ▶▶   ━━━━━━━━╸────────   -1:14   ⇄  ◁))  ↻    [cover: kitty only]
```

- **Two rows, right-aligned**: `title · artist` above the controls row. The title is bold `text`, `· artist` is `inactive`, and it truncates with `…`.
- **No backgrounds anywhere**: text on the terminal's own background. Colors are Claude Code theme keys (`text`, `inactive`, `subtle`), so it works in light and dark themes.
- **Controls** `◀◀ ❚❚ ▶▶` in `text`. **Icons** `⇄ ◁)) ↻` in `inactive`, turning bold `text` on hover. Shuffle and repeat on: bold and underlined `text`. The speaker shows the level (`◁× ` / `◁) ` / `◁))`); a click mutes or unmutes.
- **Smooth Seek bar**: `━` played in `text`, then a half-cell `╸`, on a light `─` track in `subtle`. It moves in half-cell steps with no knob, and clicking it seeks. The countdown is a fixed 7 cells in `inactive`.
- **Cover**: only where it can be a real picture (kitty or Ghostty), as a 2×1-cell rounded image with clear corners at the right end. It is left out in Windows Terminal rather than drawn as a block.
- **Narrow**: the right-hand icons drop first, then the Seek bar shrinks (8 cells minimum).

## Look: Glass (from the user's screenshot)

The user supplied a screenshot of a glossy capsule player and asked for the Bar to look exactly like it. Glass is now the prototype's default look. **If accepted, it reverses two decisions**: the Bar becomes **3 rows** (not 1), and it **shows the title and artist**.

- **Capsule**: three rows, right-aligned.
  - **Windows Terminal, tmux, and anywhere without images**: flat and square. One brown `#6A594C`, no end caps, and no banded gradient. The user rejected the stair-stepped `▗▐▝` caps and the mosaic Cover as pixelated; crisp beats fake-smooth.
  - **kitty and Ghostty**: a light-to-dark gradient (`#7D6C5D` → `#6A594C` → `#594A3E`) stands in for the frosted gloss, with anti-aliased half-disc image caps.
- kitty is **optional**. hum never requires it.
- **Left**: `◀◀ ❚❚ ▶▶` (` ▶` when paused) in `#E9E2DA`, white and bold on hover. These replace `⏪⏩`, which render as emoji.
- **Card** (inset, darker: flat `#4A3D33` without images, `#4F4237`→`#463A30` in kitty): a 4×2-cell Cover (a solid color swatch without images, a rounded picture in kitty), the title (bold `#F5F0EB`) and the artist (`#B7ABA0`), truncated with `…`. Along its bottom is a thin `▁` Seek bar, light `#EDE6DF` for played and dark `#2E251F` for the rest; clicking it seeks. No countdown.
- **Right**: `⇄  ◁))  ↻`. The speaker shows the level (`◁× ` muted, `◁) ` low, `◁))` high), and a click mutes or unmutes. Shuffle and repeat show bold and underlined when on; repeat-one is `↻¹`.
- **Narrow**: below about 62 columns the right-hand icons drop first, then the title area shrinks (6 cells minimum).
- **Hex colors**, not theme keys. The capsule paints its own background, so it reads the same on light and dark themes.
- **Open**: whether the hint row under the prompt shows all 3 rows. If it only shows one, the Bar moves to the band above the prompt.
- **Real pixels in kitty and Ghostty** (detected from `TERM`, `TERM_PROGRAM` and `KITTY_WINDOW_ID`; never inside tmux): the capsule ends are anti-aliased half-disc images, 3 cells wide, and the Cover is an image with rounded corners. Everything readable or clickable stays text cells, because the engine draws images as kitty Unicode placeholders: an image's cells are text, so nothing can be drawn over them, and gloss behind the text is impossible. Everywhere else, including Windows Terminal, the Bar uses the flat cell version.
- The real Cover still needs JPEG decoding (issue 04): images take PNG or RGBA only, in kitty too.

## Dropped looks

These were tried in Prototype 1 and dropped by the user on 2026-10-13. Their code is deleted (the repo has no git history), so this list is the only record.

- **Spotify** (from 21st.dev "Spotify Card"): looked bad in Claude Code.
- **shadcn** (shadcn/ui dark neutral tokens, one row, plus the tui-design review fixes).
- **Glow** (from 21st.dev "MusicPlayerCard").
- **Mono** (ASCII). It was also the `NO_COLOR` fallback, which is now Minimal with no colors.

The tui-design review lessons still apply to the remaining looks: theme colors or a self-painted background so light and dark both work; on-state as a shape, not just a color; a fixed-width countdown; widths measured, not guessed; and `NO_COLOR` respected.

## Open question: Cover pixels

Spotify serves covers as JPEG. The plugin's `Image` takes PNG or RGBA, and the colored-block fallback also needs pixels. A plugin has no Node, so hum will probably need to bundle a pure-JS JPEG decoder. Prototype 1 uses a hardcoded two-color swatch instead.

## Later

Add to library, lyrics, queue, device switching, keyboard shortcuts.
