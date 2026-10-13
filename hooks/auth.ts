// Logging in to Spotify with the user's own Developer app: OAuth 2.0 with
// PKCE (no client secret), as pure functions plus the platform's crypto.
// register.tsx runs the steps: opening the browser, the node helper that
// catches the redirect, the token exchange and refresh.
// Reference: https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow

export const HELPER_PORT = 8898
export const REDIRECT_URI = `http://127.0.0.1:${HELPER_PORT}/callback`
export const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
export const TOKEN_URL = 'https://accounts.spotify.com/api/token'
export const DASHBOARD_URL = 'https://developer.spotify.com/dashboard'

/** The access hum asks for: playback state and control, and playlists (for /hum-playlist). */
export const SCOPES = ['user-read-playback-state', 'user-modify-playback-state', 'playlist-read-private', 'playlist-read-collaborative']

/** What hum keeps in `$.store` under `auth`. */
export type Auth = {
  clientId: string
  accessToken: string
  refreshToken: string
  /** When the access token stops working (ms since epoch). */
  expiresAt: number
}

/** A login started by /hum-login <client-id>, waiting for Spotify's redirect. */
export type PendingLogin = { clientId: string; verifier: string; state: string }

export const isClientId = (s: string) => /^[0-9a-zA-Z]{32}$/.test(s)

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** A random string of URL-safe characters, from `bytes` random bytes. */
export const randomToken = (bytes: number) => base64url(crypto.getRandomValues(new Uint8Array(bytes)))

/** The PKCE code challenge for a verifier: base64url(SHA-256(verifier)). */
export async function challengeOf(verifier: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

export const formOf = (fields: Record<string, string>) =>
  Object.entries(fields)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')

export function authorizeUrl(clientId: string, challenge: string, state: string) {
  return `${AUTHORIZE_URL}?${formOf({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })}`
}

export const SETUP_STEPS = [
  'hum logs in with your own Spotify Developer app (Spotify Premium needed). One-time setup:',
  `  1. Open ${DASHBOARD_URL} and create an app (any name and description).`,
  `  2. Under Redirect URIs, add exactly: ${REDIRECT_URI}`,
  '  3. Under "Which API/SDKs are you planning to use?", tick Web API. Save.',
  '  4. Copy the app\'s Client ID, then run: /hum-login <client-id>',
  `hum asks for: ${SCOPES.join(', ')}.`,
].join('\n')

/** What Spotify sent back to the redirect URI: a code, an error, or not a redirect at all. */
export type Redirect = { kind: 'code'; code: string; state: string } | { kind: 'error'; error: string; state: string }

export function parseRedirect(text: string): Redirect | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  const state = url.searchParams.get('state') ?? ''
  const error = url.searchParams.get('error')
  if (error !== null) return { kind: 'error', error, state }
  const code = url.searchParams.get('code')
  return code === null ? null : { kind: 'code', code, state }
}

/** A token endpoint answer: new tokens, or why Spotify refused. */
export type TokenReply =
  | { ok: true; accessToken: string; refreshToken: string | null; expiresAt: number }
  /** `isTemporary`: Spotify's side failed (5xx, 429, no answer); trying again later may work. */
  | { ok: false; reason: string; isTemporary: boolean }

export function parseTokenReply(status: number, text: string, now: number): TokenReply {
  let json: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; error?: unknown; error_description?: unknown }
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, reason: `HTTP ${status}`, isTemporary: status >= 500 || status === 429 }
  }
  if (status === 200 && typeof json.access_token === 'string') {
    const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600
    return {
      ok: true,
      accessToken: json.access_token,
      refreshToken: typeof json.refresh_token === 'string' ? json.refresh_token : null,
      expiresAt: now + expiresIn * 1000,
    }
  }
  const error = typeof json.error === 'string' ? json.error : `HTTP ${status}`
  return {
    ok: false,
    reason: typeof json.error_description === 'string' ? `${error}: ${json.error_description}` : error,
    isTemporary: status >= 500 || status === 429,
  }
}

/**
 * The node helper: listens on 127.0.0.1:8898 for Spotify's redirect (a
 * /callback with a code or an error), prints the full redirect URL as one
 * line on stdout, thanks the browser and exits. It gives up after 5 minutes.
 */
export const HELPER_SCRIPT = `
const http = require('http');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname !== '/callback' || !(url.searchParams.has('code') || url.searchParams.has('error'))) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><title>hum</title><p style="font-family:system-ui">hum got Spotify’s answer. You can close this tab and go back to Claude Code.</p>');
  process.stdout.write('http://127.0.0.1:${HELPER_PORT}' + req.url + '\\n', () => process.exit(0));
});
server.on('error', e => { process.stderr.write(String(e && e.message) + '\\n'); process.exit(1); });
server.listen(${HELPER_PORT}, '127.0.0.1');
setTimeout(() => process.exit(2), 5 * 60 * 1000);
`
