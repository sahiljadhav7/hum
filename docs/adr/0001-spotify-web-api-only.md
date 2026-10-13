# Control Spotify only through the Web API, with each user's own Developer app

hum controls playback only through the Spotify Web API (OAuth PKCE), with no local control backend. Every user registers their own Spotify Developer app and logs in with it. The Web API works the same on WSL, Linux, macOS and Windows, controls whichever Device is active, and supports volume. Local control can't do that: `playerctl` doesn't see Spotify for Windows from WSL2, and the Windows media session has no volume.

## Considered Options

- **playerctl / AppleScript / Windows media session (local control)**: no login and works for free accounts, but it needs one backend per OS and has no volume control on Windows. Rejected.
- **Shipping one shared client ID**: Spotify's February 2026 rules limit a development-mode app to 5 hand-added users, and extended quota requires an organization with 250k+ MAU. Rejected.

## Consequences

- **Every hum user needs Spotify Premium**, because a Developer app's owner must have Premium. Free accounts can't use hum at all.
- First-time setup walks the user through creating a Developer app and pasting its client ID before the OAuth login.
- Without an Active device, hum shows the Idle state.
- To respect rate limits, Now playing is polled every few seconds and progress is interpolated locally in between.
- Demo mode answers Web API calls from canned responses inside hum, so the real API client code still runs.
