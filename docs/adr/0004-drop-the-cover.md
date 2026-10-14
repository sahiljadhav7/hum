# Drop the Cover

hum shows no Cover (the current track's album image) in any terminal. Claude Code's plugin `Image` draws real pixels only in kitty and Ghostty. Everywhere else, Windows Terminal included, a Cover can only be colored text cells. Issue 04 chose 2 cells of `▀` half-blocks for that case. Issue 05 drew the real covers that way, and the user found them "just colored blocks" in Windows Terminal (2026-10-13), so the user dropped the Cover entirely, kitty included. The placeholder Cover from issue 01 went with it.

## Considered Options

- **Half-blocks where images can't be drawn** (issue 05, built and reverted): 4 colors at 2×1 cells, which read as blocks, not a cover.
- **Bigger half-blocks** (4×2 cells, 16 colors): more shape, still visibly blocky. Not tried.
- **A Cover in kitty and Ghostty only**: the user chose to drop it everywhere instead.

## Consequences

- The Bar has no Cover in any Look. Glass's card holds only the title, the artist and the Seek bar.
- hum needs no curl, no JPEG decoder and no image download. ADR 0003 is superseded.
- Issue 05 is `wontfix`. Its code (commits 96e73f2 and 0287929, never pushed) was reset away. Issue 04's findings and `prototypes/02-cover/` stay as the record, if the Cover ever returns.
