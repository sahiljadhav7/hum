# hum

A Spotify player bar inside [Claude Code](https://claude.com/claude-code). hum draws the track that's playing, with clickable controls, in the space under Claude Code's prompt. You can skip a song without leaving the terminal.

<img width="1683" height="128" alt="Hum ss" src="https://github.com/user-attachments/assets/8ca33059-49fd-4353-8fff-cea84c063503" />


> **Status: work in progress.** The Bar, its three Looks, the Spotify Web API client and `/hum-login` work with a real Spotify account. Without one, try hum with **Demo mode**, a fake Spotify built into hum. See [Roadmap](#roadmap).

## What it does

- **Controls**: previous, play/pause, next, plus shuffle and repeat (off, all, one). Plain mouse clicks.
- **Seek bar**: shows how far into the track you are, with the time left. Click anywhere on it to jump there.
- **Volume icon**: shows the level; click it to mute and unmute.
- **Title and artist** of the track or podcast episode.
- **Three Looks**: **Glossy** (default, a two-tone capsule), **Minimal** (no background) and **Glass** (a three-row capsule with an inset card). Switch with `/hum-style`.
- It controls whichever **Spotify Connect device** is playing: the desktop app, a phone or a speaker.

## Requirements

- **Claude Code**, in its **fullscreen layout**. Claude Code only passes mouse clicks to plugins there. That's the default outside tmux.
- For real Spotify: **Spotify Premium** and your own free **Spotify for Developers app**. Spotify's API rules require both. See [ADR 0001](docs/adr/0001-spotify-web-api-only.md) for why.
- Optional:
  - **24-bit color** (`COLORTERM=truecolor`) for the warm brown capsules; without it hum uses a graphite grey palette. On Windows Terminal under WSL, add `export COLORTERM=truecolor` to `~/.bashrc`.
  - **kitty or Ghostty**, for smooth rounded capsule ends.

## Try it (from source)

```sh
git clone https://github.com/sahiljadhav7/hum.git
cd hum
claude --plugin-dir .
```

Then, inside Claude Code:

```
/hum-demo
```

The Bar appears under the prompt with fake tracks. Click away.

### Log in to Spotify

1. Run `/hum-login`. It shows the one-time setup.
2. Create an app at https://developer.spotify.com/dashboard.
3. In the app's Redirect URIs, add exactly `http://127.0.0.1:8898/callback`, tick **Web API**, and save.
4. Copy the app's **Client ID** and run `/hum-login <client-id>`.

The Spotify login opens in your browser; approve it.
- **With `node` installed**, hum finishes on its own.
- **Without it**, copy the address the browser lands on (it starts with `http://127.0.0.1:8898/callback`) and run `/hum-login <that address>`.

hum keeps the login between sessions and refreshes it by itself. `/hum-logout` forgets it.

A `/plugin install` line comes later, when hum is packaged for sharing.

## Commands

| Command | What it does |
| --- | --- |
| `/hum-style [glossy\|minimal\|glass]` | Switches the Look. With no argument, shows the current Look and the choices. Remembered across sessions. |
| `/hum-demo` | Turns Demo mode (a fake Spotify inside hum) on or off for this session. |
| `/hum-demo no-device` | Simulates "no active Spotify device" in Demo mode. |
| `/hum-demo no-volume` | Simulates a device that doesn't allow remote volume (the volume icon greys out). |
| `/hum-login [client-id \| redirect URL]` | Logs in to Spotify. With no argument, shows the one-time setup. |
| `/hum-logout` | Forgets the login. |
| `/hum-playlist` | Opens the Playlist picker, a pane with the playlists you own or collaborate on. Pick one, then a track to play it within the playlist. Spotify no longer lets Developer apps read the tracks of playlists you only follow, so those aren't listed. |

## What the Bar shows when it can't play

| Hint | Meaning |
| --- | --- |
| `hum: run /hum-login` | Not logged in to Spotify, or the login expired and couldn't be refreshed. |
| `hum: Spotify Premium is needed to control playback` | The account is free. Spotify only lets Premium accounts control playback. |
| `hum: no active Spotify device` | Nothing is playing on any Spotify device. Start Spotify somewhere. |
| `hum: nothing playing` | A device is active but has nothing loaded. |
| `hum: ad playing` | Spotify is playing an ad. |

## Roadmap

| Issue | | Status |
| --- | --- | --- |
| 01 | The Bar, its Looks, `/hum-style` | Done |
| 02 | Spotify Web API client, Demo mode | Done |
| 03 | `/hum-login` and `/hum-logout` | Done |
| 04 | Prototype: decoding the Cover | Done |
| 05 | Real Cover in the Bar | Dropped ([ADR 0004](docs/adr/0004-drop-the-cover.md)) |
| 06 | `/hum-playlist` | Done |
| 07 | Package for `/plugin install` | Planned |
| 08 | Playlist picker as a Card and Table; command reply fixes | Done |

The issues live in [`.scratch/hum/issues/`](.scratch/hum/issues/).

## How it works

hum is a Claude Code **mod**: a plugin with a hooks module that draws into Claude Code's own interface ([ADR 0002](docs/adr/0002-claude-code-plugin-not-standalone.md)).

- `hooks/register.tsx` wires up Claude Code's events. It is the only module that talks to the engine, and it holds the Web API client: polling every 4 s, back-off on `429`.
- `hooks/spotify.ts` maps clicks to Spotify Web API requests and reads Spotify's replies.
- `hooks/demo.ts` is the fake Spotify behind Demo mode.
- `hooks/bar/` draws the three Looks, the Seek bar and the pictures for kitty.

Design and vocabulary:
- [DESIGN.md](DESIGN.md): what the Bar looks like and how it behaves.
- [CONTEXT.md](CONTEXT.md): the project's glossary.
- [docs/adr/](docs/adr/): the decisions behind it.

## Development

```sh
claude plugin validate .   # what the engine would refuse
claude plugin test .       # runs tests/*.test.tsx
```

Tests go through two seams:
- **The mounted Bar and its commands:** clicks, the Seek bar, `/hum-style`, `/hum-demo`.
- **Spotify's HTTP boundary:** a test stands in for api.spotify.com and checks the exact requests.

Type-checking needs the `claude-code` type declarations, which Claude Code writes beside a plugin it loads (`.claude-plugin/types/`, not committed). Run `tsc` with a tsconfig that includes them (see `prototypes/` for an example).

## License

Not yet chosen.
