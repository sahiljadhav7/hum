# Fetch Cover bytes with curl, and decode them in hum with a vendored jpeg-js

**Superseded by [ADR 0004](0004-drop-the-cover.md)** (2026-10-13): hum dropped the Cover, so it fetches no images.

hum downloads the Cover's JPEG by running `curl -sfL -o <file> <url>` with `$.process.run`, then reads the file back with `$.fs.read(file, { as: 'bytes' })`. It decodes the JPEG itself with jpeg-js's decoder, vendored into hum. `$.http.fetch` can't do this job. It returns the body as UTF-8 text, so a binary body is destroyed: in issue 04 a 2822-byte cover came back as 2663 characters, 1041 of them U+FFFD. curl's stdout through `$.process.run` is mangled the same way, so the bytes have to go through a file.

## Considered Options

- **`$.http.fetch`**: what hum uses for every other request, but the bytes are lost. Rejected.
- **curl's stdout**: mangled like `$.http.fetch`. Rejected.
- **A third-party image proxy that answers in base64 or PNG**: it would work with `$.http.fetch`, but it would send what the user listens to to someone other than Spotify. Rejected.
- **`node`** (already an optional helper for `/hum-login`): many users don't have it. curl ships with macOS and Windows 10+ and nearly every Linux. Rejected.

## Consequences

- **The Cover needs curl.** Without it, or when the fetch or decode fails, the Cover stays empty and the rest of the Bar is unaffected.
- hum writes each cover to a file before reading it. Issue 05 decides where that file lives; `/tmp` doesn't exist on Windows.
- The decoder (41 KB, 13 KB minified) ships inside hum under its licenses: Apache-2.0 for the file (from pdf.js) and BSD-3 for the jpeg-js package.
- If a future engine lets `$.http.fetch` return bytes, hum can drop curl. Only the fetch changes; the decoding stays.
