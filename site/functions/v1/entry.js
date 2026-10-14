// POST /v1/entry: a museum entry, sent by the walk once when a wing opens in a tab that holds a yes to the question
// for visitors from our Google Ad Grants ads (site/_src/js/ask.js, museum/src/core/museum-entry.ts). The function
// checks the request and its three fields, then reports one conversion to the Google Ads API, server to server: the
// click id, the conversion action, the time now, an order id made from the click id and the wing, and the consent
// signal. Nothing else about the visitor goes out, and nothing is kept here. It answers 204 whatever happens.
// The click id is never logged, stored or echoed: every line it could reach is redacted first.
// Every setting comes from the environment. Without all of them nothing is sent, so the code can stand live dark.

import { CLICK, YES_MAX_AGE_MS } from '../_entry/rules.js'
import { WING_STOPS } from '../_count/lists.js'

/** The Google Ads API version Agora Cosmica's worker uploads with. */
export const API_VERSION = 'v24'
export const SETTINGS = Object.freeze(['GADS_DEVELOPER_TOKEN', 'GADS_CLIENT_ID', 'GADS_CLIENT_SECRET', 'GADS_REFRESH_TOKEN',
  'GADS_LOGIN_CUSTOMER_ID', 'GADS_CUSTOMER_ID', 'MOA_ENTRY_ACTION'])
// three short fields: anything much larger is not ours
export const MAX_BODY = 512
// a browser's clock may run a little ahead of the server's
export const YES_SKEW_MS = 5 * 60 * 1000
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const TIMEOUT_MS = 10_000

const quiet = () => new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })

/** The entry a body names ({ gclid, wing }), or null when any field is off its rule. */
export function entryOf(text, now) {
  let body
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const { gclid, yes, wing } = body
  if (typeof gclid !== 'string' || !CLICK.test(gclid)) return null
  if (typeof wing !== 'string' || !Object.hasOwn(WING_STOPS, wing)) return null
  if (!Number.isFinite(yes) || yes < now - YES_MAX_AGE_MS || yes > now + YES_SKEW_MS) return null
  return { gclid, wing }
}

const digits = (value) => (typeof value === 'string' ? value.replace(/-/g, '') : '')

/** The settings from the environment, or null when one is missing or off its shape. */
export function settingsOf(env) {
  if (!env || SETTINGS.some((name) => typeof env[name] !== 'string' || !env[name].trim())) return null
  const customer = digits(env.GADS_CUSTOMER_ID.trim())
  const login = digits(env.GADS_LOGIN_CUSTOMER_ID.trim())
  if (!/^\d{10}$/.test(customer) || !/^\d{10}$/.test(login)) return null
  // the action as its resource name in the customer's own account, or its bare number there
  const raw = env.MOA_ENTRY_ACTION.trim()
  const named = /^customers\/(\d{10})\/conversionActions\/(\d+)$/.exec(raw)
  const id = /^\d+$/.test(raw) ? raw : named && named[1] === customer ? named[2] : ''
  if (!id) return null
  const action = `customers/${customer}/conversionActions/${id}`
  return {
    developerToken: env.GADS_DEVELOPER_TOKEN.trim(), clientId: env.GADS_CLIENT_ID.trim(), clientSecret: env.GADS_CLIENT_SECRET.trim(),
    refreshToken: env.GADS_REFRESH_TOKEN.trim(), loginCustomerId: login, customerId: customer, action,
  }
}

/** The order id: the click id and the wing, hashed, so one click counts once per wing and the id stays short. */
export async function orderIdOf(gclid, wing) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${gclid}:${wing}`))
  return 'moa-' + [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

/** Google's time format: "yyyy-MM-dd HH:mm:ss+00:00", in UTC. */
export function dateTimeOf(ms) {
  return new Date(ms).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '+00:00')
}

/** The one upload's body. Its fields are the whole of what Google receives about the entry. */
export function uploadBody(entry, settings, now, orderId) {
  return {
    conversions: [{
      gclid: entry.gclid,
      conversionAction: settings.action,
      conversionDateTime: dateTimeOf(now),
      orderId,
      // only a yes is ever sent: measurement allowed, personalised advertising not
      consent: { adUserData: 'GRANTED', adPersonalization: 'DENIED' },
    }],
    partialFailure: true,
  }
}

/** Text from Google with the click id, the order id and anything shaped like a click id taken out. */
export function redact(text, ...secrets) {
  let out = typeof text === 'string' ? text : ''
  for (const secret of secrets) if (secret) out = out.split(secret).join('[redacted]')
  return out.replace(/[A-Za-z0-9_-]{20,}/g, '[redacted]')
}

// an access token lives about an hour: kept in this isolate's memory, never anywhere else
let token = null
/** Forgets the access token held in memory (the tests start each upload afresh). */
export function forgetToken() {
  token = null
}

async function accessToken(settings, now, fetcher) {
  if (token && token.until > now) return token.value
  const res = await fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret,
      refresh_token: settings.refreshToken, grant_type: 'refresh_token' }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`token http ${res.status}`)
  const data = await res.json()
  if (typeof data?.access_token !== 'string' || !data.access_token) throw new Error('token answer without a token')
  const life = Number.isFinite(data.expires_in) ? data.expires_in : 3600
  token = { value: data.access_token, until: now + Math.max(60, life - 60) * 1000 }
  return token.value
}

/**
 * Reports one entry to Google. Resolves to a short outcome word and never throws. Its log lines name the outcome
 * and Google's message, redacted, and nothing else.
 */
export async function report(entry, settings, now, fetcher = fetch) {
  let orderId = ''
  try {
    orderId = await orderIdOf(entry.gclid, entry.wing)
    const bearer = await accessToken(settings, now, fetcher)
    const res = await fetcher(`https://googleads.googleapis.com/${API_VERSION}/customers/${settings.customerId}:uploadClickConversions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'developer-token': settings.developerToken,
        'login-customer-id': settings.loginCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(uploadBody(entry, settings, now, orderId)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[entry] upload http ${res.status}: ${redact(text, entry.gclid, orderId).slice(0, 400)}`)
      return 'http'
    }
    const answer = await res.json().catch(() => null)
    const failure = answer?.partialFailureError?.message
    if (failure) {
      // a click the account did not issue, or one counted before, lands here
      console.log(`[entry] not counted: ${redact(failure, entry.gclid, orderId).slice(0, 300)}`)
      return 'partial'
    }
    console.log('[entry] counted')
    return 'ok'
  } catch (err) {
    console.error(`[entry] failed: ${redact(String(err?.message ?? err), entry.gclid, orderId).slice(0, 200)}`)
    return 'error'
  }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    // a page on another site may not send here: the Origin must be this site's own
    if (request.headers.get('Origin') !== new URL(request.url).origin) return quiet()
    // a browser that sends Global Privacy Control is never reported
    if (request.headers.get('Sec-GPC') === '1') return quiet()
    if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return quiet()
    const text = await request.text()
    if (!text || text.length > MAX_BODY) return quiet()
    const now = Date.now()
    const entry = entryOf(text, now)
    if (!entry) return quiet()
    const settings = settingsOf(env)
    if (!settings) return quiet()
    const job = report(entry, settings, now)
    if (typeof context.waitUntil === 'function') context.waitUntil(job)
    else await job
  } catch {
    // an entry never answers with an error
  }
  return quiet()
}
