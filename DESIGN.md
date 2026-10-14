# hum: design

hum is a Claude Code plugin. It draws a Spotify Bar under Claude Code's prompt, with the track's title and artist, clickable playback Controls, a Seek bar and a Volume icon. Terms are defined in [CONTEXT.md](CONTEXT.md). The key decisions are recorded in [ADR 0001](docs/adr/0001-spotify-web-api-only.md) (Web API only) and [ADR 0002](docs/adr/0002-claude-code-plugin-not-standalone.md) (Claude Code plugin, not a standalone app). [ADR 0004](docs/adr/0004-drop-the-cover.md) drops the Cover.

This document replaces the tmux, standalone, and title/artist plan in `idea.md`.

## Shape

- A Claude Code plugin (a mod: a plugin with a hooks module that draws UI), installed with `/plugin install`.
- Written in TypeScript. It runs only inside Claude Code, in any terminal, without tmux.
- The Bar takes the place of Claude Code's hint line under the prompt (`esc to interrupt`, `? for shortcuts`). It shows even while Claude is working.

## The Bar

**Decided 2026-10-13: hum ships all three looks**, **Glossy** (the default), **Minimal** and **Glass**. Users switch with `/hum-style`, and the choice is remembered across sessions. Each is described in its own section below. What they share:

- **Title and artist are shown.** This reverses the earlier "no title or artist" decision, after the user supplied a reference screenshot.
- **Controls** `◀◀ ❚❚ ▶▶` (` ▶` when paused), plus `⇄` shuffle, `◁))` volume and `↻` repeat on the right. Plain click. Hovering `⇄` shows ` Shuffle ` (inverse) on the row above it, painted over that row so nothing moves.
- **Seek bar**: a thin line you can click to seek. Glossy and Minimal also show a fixed 7-cell countdown (`-1:14`).
- **Volume** is an icon, not a slider: it shows the level (`◁× ` / `◁) ` / `◁))`) and a click mutes or unmutes.
- **No Cover** (album image), in any terminal: dropped 2026-10-13. See [The Cover: dropped](#the-cover-dropped-2026-10-13).
- **Right-aligned.** As the width shrinks, the right-hand icons drop first, then the Seek bar shrinks.
- **Height**: two rows (Glossy, Minimal) or three (Glass). The row under the prompt shows them all (confirmed by a user screenshot).
- **`NO_COLOR`**: Minimal with no colors at all, using only bold, underline and inverse on hover.
- **Idle state**: one dim hint line in place of the Controls, e.g. `hum: run /hum-login`, only when hum can't control anything (not logged in, a free account, an ad).
- **Stays active when the music stops** (issue 09). When Spotify drops the Device, or has nothing loaded, the Bar keeps the last track, paused (` ▶`), with its Seek bar frozen where it stopped and all its Controls. Before anything has played it shows its Controls with a dim `Nothing playing` in place of the title.
- **▶ wakes a Device**: with none active, ▶ asks Spotify for the user's Devices (`GET /v1/me/player/devices`) and moves playback to the one last seen playing if it's still listed, else to the first that has an id and isn't restricted (`PUT /v1/me/player`, `{ device_ids: [id], play: true }`). The Bar shows ❚❚ at once, and for 5 s a poll that doesn't list the Device yet doesn't undo it. The other Controls send nothing then.
- **Notes**: for 5 s, a dim line in place of the title says what happened: `Open Spotify on your phone or computer, then ▶` when there's no Device to wake or Spotify refuses the transfer, and `No active device: press ▶ to start one` for another Control.
- No keyboard shortcuts in v1, and no popups or toasts when a control is used.

## Spotify

- **Web API only**: hum controls whichever Device is active, including a phone or a speaker.
- Each user creates their own **Developer app** with the redirect URI `http://127.0.0.1:8898/callback`. Premium is required, because the app owner must have it, so free accounts can't use hum.
- hum polls Now playing every 4 s. **Clicks show at once**: ▶/❚❚, shuffle, repeat, mute/unmute and a Seek bar click change the Bar before Spotify answers, and for 1.5 s a poll doesn't undo them (Spotify applies a command a moment after accepting it); then hum reads Spotify again, which puts back anything it didn't apply. A refused click is put back at once. Next and previous wait for Spotify: hum reads right after, and again 0.5 s later. Between polls the Seek bar moves on locally: each redraw places it from the time of the last poll, and between redraws it ticks forward once a second by itself.
- Podcasts: the poll asks for episodes too (`additional_types=episode`) and shows the episode and its show. During an ad the Bar says `hum: ad playing`; with a Device but nothing loaded it keeps its Controls, as with no Device.
- An error reply (5xx, 403...) keeps the last Now playing rather than claiming there's no Device.
- After a `429`, hum sends nothing until `Retry-After` has passed. A `401` shows `hum: run /hum-login`, and the refused token isn't sent again (issue 03 refreshes it there first).
- Before `/hum-login` (and with Demo mode off), the Bar is the Idle hint `hum: run /hum-login`.
- Tokens persist across sessions.

## Commands

| Command | Does |
| --- | --- |
| `/hum-login` | With no argument: the one-time Developer app setup steps (the dashboard link, the exact redirect URI `http://127.0.0.1:8898/callback`, the scopes). `/hum-login <client-id>` opens the Spotify login in the browser (wslview or PowerShell's `Start-Process` under WSL, `open` on macOS, `xdg-open` on Linux), with PKCE and no client secret. A `node` helper on 127.0.0.1:8898, started before the browser opens, catches the redirect and finishes on its own. It accepts only a redirect carrying this login's state (anything else, say from a web page, gets a 404 and it keeps waiting); a new `/hum-login`, or a pasted address, stops it. Without `node`, or if the helper can't listen, paste the address the browser lands on: `/hum-login <that URL>` (the Bar says so). Later, `/hum-login` with no argument logs in again with the stored client ID. Tokens are kept in `$.store` and refreshed a minute before they expire, or on a `401` (with one retry). A failure on Spotify's side (5xx, no answer) is temporary and doesn't log you out. A free account (`403 PREMIUM_REQUIRED`) gets `hum: Spotify Premium is needed to control playback`, and hum stops sending until the next login. |
| `/hum-logout` | Forgets the login (client ID and tokens). The Bar goes back to `hum: run /hum-login`. |
| `/hum-playlist` | Opens the Playlist picker: the playlists the user owns or collaborates on, then the chosen playlist's tracks. Picking a track plays it within its playlist on the Active device, and the pane closes. See [Playlist picker](#playlist-picker). |
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
- `/hum-proto style` → Minimal gives the same layout with no background.
- **Color depth**: the browns need truecolor. Without `COLORTERM=truecolor` (the default in a WSL shell), Claude Code rounds colors into the xterm 256-color cube. The user's screenshot showed `#7A695B` → grey `#878787` and `#68584B` → olive `#87875F`. hum then switches to a graphite gloss built only from exact grayscale-ramp entries (`#585858` / `#444444`, text `#EEEEEE` / `#BCBCBC`), so nothing shifts. Glass does the same (user, 2026-10-13: "I don't like the pink and green one"): its browns rounded to olive green and its beige artist text to pink. Without truecolor it uses graphite too (`#4E4E4E` capsule, `#3A3A3A` card).

## Look: Minimal

The user asked for "smooth and minimalist" after Glass. Filled backgrounds are what read as blocky and pixelated in a terminal, so Minimal has none.

```
                          Muddy Feet (feat Sia) · Miley Cyrus, Sia
  ◀◀  ❚❚  ▶▶   ━━━━━━━━╸────────   -1:14   ⇄  ◁))  ↻
```

- **Two rows, right-aligned**: `title · artist` above the controls row. The title is bold `text`, `· artist` is `inactive`, and it truncates with `…`.
- **No backgrounds anywhere**: text on the terminal's own background. Colors are Claude Code theme keys (`text`, `inactive`, `subtle`), so it works in light and dark themes.
- **Controls** `◀◀ ❚❚ ▶▶` in `text`. **Icons** `⇄ ◁)) ↻` in `inactive`, turning bold `text` on hover. Shuffle and repeat on: bold and underlined `text`. The speaker shows the level (`◁× ` / `◁) ` / `◁))`); a click mutes or unmutes.
- **Smooth Seek bar**: `━` played in `text`, then a half-cell `╸`, on a light `─` track in `subtle`. It moves in half-cell steps with no knob, and clicking it seeks. The countdown is a fixed 7 cells in `inactive`.
- **Narrow**: the right-hand icons drop first, then the Seek bar shrinks (8 cells minimum).

## Look: Glass (from the user's screenshot)

The user supplied a screenshot of a glossy capsule player and asked for the Bar to look exactly like it. **If accepted, it reverses two decisions**: the Bar becomes **3 rows** (not 1), and it **shows the title and artist**.

- **Capsule**: three rows, right-aligned.
  - **Windows Terminal, tmux, and anywhere without images**: flat and square. One brown `#6A594C`, no end caps, and no banded gradient. The user rejected the stair-stepped `▗▐▝` caps and a mosaic Cover as pixelated; crisp beats fake-smooth.
  - **kitty and Ghostty**: a light-to-dark gradient (`#7D6C5D` → `#6A594C` → `#594A3E`) stands in for the frosted gloss, with anti-aliased half-disc image caps.
- kitty is **optional**. hum never requires it.
- **Left**: `◀◀ ❚❚ ▶▶` (` ▶` when paused) in `#E9E2DA`, white and bold on hover. These replace `⏪⏩`, which render as emoji.
- **Card** (inset, darker: flat `#4A3D33` without images, `#4F4237`→`#463A30` in kitty): the title (bold `#F5F0EB`) and the artist (`#B7ABA0`), truncated with `…`. Along its bottom is a thin `▁` Seek bar, light `#EDE6DF` for played and dark `#2E251F` for the rest; clicking it seeks. No countdown.
- **Right**: `⇄  ◁))  ↻`. The speaker shows the level (`◁× ` muted, `◁) ` low, `◁))` high), and a click mutes or unmutes. Shuffle and repeat show bold and underlined when on; repeat-one is `↻¹`.
- **Narrow**: below 64 columns (70 in kitty, with its picture ends) the right-hand icons drop first, then the title area shrinks (6 cells minimum).
- **Hex colors**, not theme keys. The capsule paints its own background, so it reads the same on light and dark themes.
- **Open**: whether the hint row under the prompt shows all 3 rows. If it only shows one, the Bar moves to the band above the prompt.
- **Real pixels in kitty and Ghostty** (detected from `TERM`, `TERM_PROGRAM` and `KITTY_WINDOW_ID`; never inside tmux): the capsule ends are anti-aliased half-disc images, 3 cells wide. Everything readable or clickable stays text cells, because the engine draws images as kitty Unicode placeholders: an image's cells are text, so nothing can be drawn over them, and gloss behind the text is impossible. Everywhere else, including Windows Terminal, the Bar uses the flat cell version.

## Dropped looks

These were tried in Prototype 1 and dropped by the user on 2026-10-13. Their code is deleted (the repo has no git history), so this list is the only record.

- **Spotify** (from 21st.dev "Spotify Card"): looked bad in Claude Code.
- **shadcn** (shadcn/ui dark neutral tokens, one row, plus the tui-design review fixes).
- **Glow** (from 21st.dev "MusicPlayerCard").
- **Mono** (ASCII). It was also the `NO_COLOR` fallback, which is now Minimal with no colors.

The tui-design review lessons still apply to the remaining looks: theme colors or a self-painted background so light and dark both work; on-state as a shape, not just a color; a fixed-width countdown; widths measured, not guessed; and `NO_COLOR` respected.

## The Cover: dropped (2026-10-13)

hum shows no Cover (album image) in any terminal ([ADR 0004](docs/adr/0004-drop-the-cover.md)). Claude Code's plugin `Image` draws real pixels only in kitty and Ghostty. Everywhere else, Windows Terminal included, a Cover can only be colored text cells. The user saw the real covers drawn that way (issue 05) and found them "just colored blocks", so the whole Cover was dropped, kitty included, and so was the earlier placeholder.

What issue 04 learned, kept in case the Cover returns (the issue 04 Answer; the prototype is in git history at ad7011b):
- `$.http.fetch` returns the body as UTF-8 text and destroys a JPEG. The bytes came through `curl -o <file>` and `$.fs.read(file, { as: 'bytes' })` ([ADR 0003](docs/adr/0003-cover-bytes-through-curl.md), now superseded).
- jpeg-js, vendored, decodes a 64 px cover in about 1 ms inside the engine. Call it with `{ useTArray: true }`.

## Playlist picker

A Claude Code pane (`$.ui.open`, id `hum-playlist`, title "Playlists"), opened with the keyboard and closed by Esc. Its layout follows shadcn's Card and Table (chosen 2026-10-14, issue 08), drawn with Claude Code's own elements: shadcn/ui is React for the browser and can't draw in the terminal. The pane's frame is the card's border, so hum draws no second one.

```
Playlists
2 of yours · 15 tracks
──────────────────────────────────────────────────
Late night code                         3 tracks ›
Road trip with a very very long playl… 12 tracks ›

  inside a playlist:
‹ Playlists
Late night code
3 tracks
──────────────────────────────────────────────────
 #  Title                  Artist             Time
 1  Espresso               Sabrina Carpent…   2:55
♪3  Flowers                Miley Cyrus        3:20
```

- **Card head**: a bold title, a dim description, then a dim rule as wide as the pane. For the playlists the description is `N of yours · M tracks` (`N+` while Spotify has more pages); inside one it is the playlist's track count.
- **Playlist rows**: one plain `Button` each, the name in the theme's `text` and `N tracks ›` dim at the right edge; a long name is cut with `…`.
- **Track table**: a dim header `# Title Artist Time`, then one plain `Button` per track: its number in the playlist, the title, the artist dim, and the duration (`m:ss`) dim and right-aligned. Title and artist share the width left over, about 55/45, each cut with `…`. Episodes show their show as the artist.
- **Widths are columns, not characters**: emoji and East Asian wide characters count as 2, marks and joiners as 0 (one grapheme at a time), so a name like `🔥 Hits` stays aligned. The Bar measures the same way.
- **Playing now**: the row whose Spotify URI is the track playing has `♪` before its number in the theme's `success`, and a bold title.
- **Back**: `‹ Playlists`, dim, above the playlist's name.
- **Only the user's own and collaborative playlists.** Since March 2026 Spotify returns a playlist's items (`GET /v1/playlists/{id}/items`) only to its owner or collaborators, so followed playlists aren't listed. Ownership is the playlist's `owner.id` against `GET /v1/me`.
- **50 at a time**: a `More…` row at the bottom loads the next 50 (pressed twice, the page is added once). The pane scrolls a list taller than itself.
- **A track plays within its playlist**: `PUT /v1/me/player/play` with the playlist's `context_uri` and `offset.position`, so next and previous follow it. Unavailable entries and local files (Spotify can't start one remotely) get no row but keep their place in the count.
- **A note under the head** in the theme's `warning` says why a pick didn't play: no Active device (hum's last poll said so, or Spotify answered `404`), hum not sending (logged out, a free account, or a back-off: the Bar says which), or Spotify's status. The pane stays open then; it closes only once Spotify accepts the play.
- **Not logged in**: `/hum-playlist` answers `hum: run /hum-login first to see your playlists.` and opens nothing.

## Command replies

Claude Code shows a command's reply after the plugin's name (`hum: …`), so hum's replies don't start with `hum:` themselves (issue 08: the user saw `hum: hum: your playlists are open.`). The Bar's Idle hints and the picker's notes are drawn by hum and keep their `hum:`.

## Later

Add to library, lyrics, queue, device switching, keyboard shortcuts.
