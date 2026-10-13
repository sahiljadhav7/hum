# hum

A Claude Code plugin that shows what Spotify is playing and offers clickable playback controls, like the player bar in the Spotify desktop app, on a single row under Claude Code's prompt.

## Language

**Bar**:
The one-row strip under the prompt holding the Controls, Seek bar, Volume slider and Cover, with no track title or artist names.
_Avoid_: Player, widget, status line, pane

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
The clickable buttons: shuffle, previous, play/pause, next, repeat.
_Avoid_: Buttons row, transport

**Seek bar**:
The progress slider with a single time: the remaining time, which starts at the track's length and counts down. Clicking it jumps playback to that position.
_Avoid_: Scrubber, progress bar

**Cover**:
The album artwork of the current track, drawn to the right of the Controls.
_Avoid_: Album art, thumbnail, artwork

**Volume slider**:
The slider setting the Active device's volume.

**Developer app**:
The Spotify for Developers registration each user creates for themselves, whose client ID hum logs in with. The owner must have Premium.
_Avoid_: Spotify app (that means the desktop player), client

**Demo mode**:
Running the Bar against a fake Spotify service instead of the real one, so the UI can be exercised without an account.
