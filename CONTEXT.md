# hum

A Claude Code plugin that shows what Spotify is playing and offers clickable playback controls, like the player bar in the Spotify desktop app, in the space under Claude Code's prompt.

## Language

**Bar**:
The strip under the prompt, two or three rows depending on the Look, showing the track's title and artist with the Controls, Seek bar and Volume icon.
_Avoid_: Player, widget, status line, pane

**Look**:
One of the Bar's visual designs, chosen by the user: Glossy, Minimal or Glass.
_Avoid_: Theme, skin, style (except in the `/hum-style` command name)

**Player**:
The Spotify playback the Bar observes and controls, wherever it is actually running.
_Avoid_: Client, app

**Device**:
A Spotify Connect endpoint (desktop app, phone, speaker) that plays audio for the Player.
_Avoid_: Output, source

**Active device**:
The Device currently holding the Player's playback session. Without one, the Bar is idle.

**Idle state**:
What the Bar shows when it can't control anything (no Active device, or not logged in yet): one dim line of hint text in place of the Controls.

**Now playing**:
The track, its artists, progress, duration, and the Player's play, shuffle, repeat and volume state at a moment in time.
_Avoid_: Status, current song

**Controls**:
The clickable buttons: previous, play/pause and next, plus shuffle and repeat.
_Avoid_: Buttons row, transport

**Seek bar**:
The thin line showing how far into the track playback is; clicking it jumps playback to that position. Some Looks show the remaining time beside it, counting down.
_Avoid_: Scrubber, progress bar, progress line

**Cover**:
The album artwork of the current track. hum doesn't show it (dropped 2026-10-13, ADR 0004); the term stays for the issues and ADRs that discuss it.
_Avoid_: Album art, thumbnail, artwork

**Volume icon**:
The speaker glyph showing the Active device's volume level; clicking it mutes and unmutes.
_Avoid_: Volume slider (the Bar has none)

**Developer app**:
The Spotify for Developers registration each user creates for themselves, whose client ID hum logs in with. The owner must have Premium.
_Avoid_: Spotify app (that means the desktop player), client

**Demo mode**:
Running the Bar against a fake Spotify service instead of the real one, so the UI can be exercised without an account.
