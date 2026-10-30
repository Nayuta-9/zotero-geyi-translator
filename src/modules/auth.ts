import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { logDebug } from "../utils/log"
import { clearPref, getPref, setPref } from "../utils/prefs"
import { withPluginIdentity } from "../utils/http"
import { accountConfirmContent, promptAccountConfirm } from "./accountNotice"
import { emitTelemetry } from "./telemetry"

// 授权流 + 凭证存储(GEYI-328)。凭证 = api_key(Bearer)+ api_base_url(/v1 基址)。
// 登录走 Device Flow:开浏览器同意页 → 插件轮询后端取 Key(避开被 Chrome CORS/PNA 拦
// 的 loopback);失败可手动粘贴 Key。
// The poll also reports why an authorization ended (cancelled in the browser,
// ineligible membership, expired link) so the plugin can stop and explain.
// Each sign-in proves possession of a local code verifier: only its S256
// challenge reaches the start URL and the consent page, and the verifier
// itself travels only in the poll request body.
// A key the poll hands out is kept only after the user confirms its account,
// unless that account is the one confirmed last time; a rejected key is
// discarded and revoked on the server.

// The backend signs the authorization state for 10 minutes and reports
// `expired` after that; the local cap only covers a backend that never does.
const AUTH_TIMEOUT_MS = 10 * 60 * 1000 + 30 * 1000
const POLL_INTERVAL_MS = 2000
// Polling stops with a network error once requests have failed to reach the
// server for this long with no server response in between. Error responses
// from the server (429/5xx) do not count; they are retried until the
// authorization window ends.
const NETWORK_GIVE_UP_MS = 60 * 1000
// Zotero retries 5xx responses internally for up to an hour unless this is 0;
// the poll loop does its own retrying so its deadline stays in force.
const AUTH_REQUEST_OPTIONS = { responseType: "text", errorDelayMax: 0 }
// Revoking a rejected key is retried this many times on network or server
// errors, this far apart, before the plugin gives up on it.
const REVOKE_ATTEMPTS = 3
const REVOKE_RETRY_MS = 1000

/** Pref holding the fingerprint of the account the user last confirmed. */
export const CONFIRMED_ACCOUNT_PREF = "confirmedAccountFingerprint"
const FINGERPRINT_RE = /^[0-9a-f]{16,128}$/
const MAX_EMAIL_MASKED_LENGTH = 254

const PLANS_URL = `${config.webBase}/billing?source=zotero_plugin`

/** Why a browser sign-in ended without a key. */
export type LoginFailureReason =
  | "not_eligible"
  | "cancelled"
  | "expired"
  | "timeout"
  | "network"
  | "busy"
  | "account_rejected"
  | "failed"

const FAILURE_MESSAGE_KEYS: Record<LoginFailureReason, string> = {
  not_eligible: "login-not-eligible",
  cancelled: "login-cancelled",
  expired: "login-expired",
  timeout: "login-timeout",
  network: "login-network",
  busy: "login-busy",
  account_rejected: "login-account-rejected",
  failed: "auth-failed",
}

/** A key handed out by the poll, with the account it belongs to when the backend names it. */
export interface IssuedKey {
  key: string
  base: string
  /** Masked email of the key's account. */
  emailMasked?: string
  /** Stable opaque identifier of the key's account. */
  fingerprint?: string
}

export interface LoginOptions {
  /** Window the account confirmation is modal to; the main window when absent. */
  win?: Window | null
  /**
   * Asks whether the issued key's account is the user's and resolves to
   * `true` to keep the key. Defaults to a modal dialog.
   */
  confirmAccount?: (issued: IssuedKey) => boolean | Promise<boolean>
}

/** Error thrown by `startLogin`; `message` is the localized explanation. */
export class LoginError extends Error {
  readonly reason: LoginFailureReason

  constructor(reason: LoginFailureReason) {
    super(getString(FAILURE_MESSAGE_KEYS[reason]))
    this.name = "LoginError"
    this.reason = reason
  }
}

/**
 * Maps a poll `status` to how the sign-in proceeds. Unknown values, including
 * statuses a newer backend may add, read as `pending` so polling continues.
 */
export function pollOutcome(
  status: unknown,
): "ready" | "pending" | "not_eligible" | "cancelled" | "expired" {
  switch (status) {
    case "ready":
    case "not_eligible":
    case "cancelled":
    case "expired":
      return status
    default:
      return "pending"
  }
}

/**
 * Classifies a rejected `Zotero.HTTP.request`. `busy` is a 429 or 5xx answer
 * from the server, `rejected` is any other 4xx answer, and `network` is a
 * request that got no HTTP answer (offline, DNS, TLS, timeout).
 */
export function requestFailureKind(error: unknown): "network" | "busy" | "rejected" {
  const status = responseStatus(error)
  if (status === 429 || (status >= 500 && status < 600)) return "busy"
  if (status >= 400 && status < 500) return "rejected"
  return "network"
}

/** HTTP status of a rejected `Zotero.HTTP.request`, or 0 when no answer arrived. */
function responseStatus(error: unknown): number {
  const e = error as any
  return Number(e?.status ?? e?.xmlhttp?.status ?? e?.xhr?.status ?? 0)
}

/** Returns the reason behind a `startLogin` rejection; non-login errors read as `failed`. */
export function loginFailureReason(error: unknown): LoginFailureReason {
  return error instanceof LoginError ? error.reason : "failed"
}

/**
 * Explains a failed sign-in in a dialog. An ineligible tier gets a confirm
 * dialog whose OK opens the membership plans page.
 */
export function showLoginFailure(win: Window, error: unknown): void {
  const reason = loginFailureReason(error)
  const message = getString(FAILURE_MESSAGE_KEYS[reason])
  if (reason !== "not_eligible") {
    win.alert(message)
    return
  }
  if (win.confirm(`${message}\n\n${getString("dialog-upgrade")}?`)) {
    void emitTelemetry("click_upgrade")
    Zotero.launchURL(PLANS_URL)
  }
}

export function getCredentials(): { key: string; base: string } | null {
  const enc = getPref<string>("apiKeyEnc")
  const base = getPref<string>("apiBaseUrl")
  if (!enc || !base) return null
  try {
    return { key: decodeKey(enc), base }
  } catch {
    return null
  }
}

export function isLoggedIn(): boolean {
  return getCredentials() !== null
}

export function setCredentials(key: string, base: string): void {
  setPref("apiKeyEnc", encodeKey(key))
  setPref("apiBaseUrl", base)
}

export function clearCredentials(): void {
  clearPref("apiKeyEnc")
  clearPref("apiBaseUrl")
}

// base64 包装 —— 非强加密(Zotero 无系统钥匙串),仅让 profile 目录明文 grep 'sk_live_'
// 搜不到(AC-03 的可达口径:防随手翻文件,防不了恶意插件)。
function encodeKey(k: string): string {
  return btoa(unescape(encodeURIComponent(k)))
}
function decodeKey(e: string): string {
  return decodeURIComponent(escape(atob(e)))
}

/** Encodes `bytes` as base64url without padding. */
function base64Url(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/** Returns a fresh code verifier: 32 random bytes as 43 base64url characters. */
export function createCodeVerifier(): string {
  const bytes = new Uint8Array(32)
  ;(globalThis.crypto as Crypto).getRandomValues(bytes)
  return base64Url(bytes)
}

/** WebCrypto digest API of the plugin scope, or of the main window when the scope lacks it. */
function subtleCrypto(): SubtleCrypto | undefined {
  const own = (globalThis.crypto as Crypto | undefined)?.subtle
  if (own) return own
  return (Zotero as any).getMainWindow?.()?.crypto?.subtle
}

/** Returns the S256 code challenge of `verifier`: unpadded base64url of its SHA-256. */
export async function codeChallengeFor(verifier: string): Promise<string> {
  const subtle = subtleCrypto()
  if (!subtle) throw new Error("WebCrypto digest is unavailable")
  const data = new Uint8Array(verifier.length)
  for (let i = 0; i < verifier.length; i++) data[i] = verifier.charCodeAt(i)
  return base64Url(new Uint8Array(await subtle.digest("SHA-256", data)))
}

/**
 * Reads the key and account a `ready` poll answer carries. An account field
 * that is missing or malformed is left out.
 */
export function issuedKeyFrom(data: any): IssuedKey {
  const issued: IssuedKey = { key: String(data.api_key), base: String(data.api_base_url) }
  const masked = data.account_email_masked
  if (typeof masked === "string" && masked.trim()) {
    issued.emailMasked = masked.trim().slice(0, MAX_EMAIL_MASKED_LENGTH)
  }
  const fingerprint = data.account_fingerprint
  if (typeof fingerprint === "string" && FINGERPRINT_RE.test(fingerprint)) {
    issued.fingerprint = fingerprint
  }
  return issued
}

/** Whether `fingerprint` names the account the user confirmed last time. */
export function isConfirmedAccount(fingerprint: string | undefined): boolean {
  return fingerprint !== undefined && getPref<string>(CONFIRMED_ACCOUNT_PREF) === fingerprint
}

/**
 * Revokes `issued.key` on the server with the key itself as credential.
 * Resolves to whether the key no longer authenticates; a 401 answer counts as
 * revoked. Network and server errors are retried a few times; it never rejects.
 */
export async function revokeIssuedKey(issued: IssuedKey): Promise<boolean> {
  const url = `${config.authApiBase}/plugin/key/revoke`
  for (let attempt = 1; attempt <= REVOKE_ATTEMPTS; attempt++) {
    try {
      await Zotero.HTTP.request(
        "POST",
        url,
        withPluginIdentity(url, {
          ...AUTH_REQUEST_OPTIONS,
          headers: { Authorization: `Bearer ${issued.key}` },
        }),
      )
      return true
    } catch (error) {
      if (responseStatus(error) === 401) return true
      if (requestFailureKind(error) === "rejected") break
      if (attempt < REVOKE_ATTEMPTS) await Zotero.Promise.delay(REVOKE_RETRY_MS)
    }
  }
  logDebug("rejected plugin key could not be revoked")
  return false
}

/**
 * Stores `issued` as the plugin's credentials once its account is confirmed.
 *
 * The account the user confirmed last time is accepted without asking. Any
 * other account, including one the backend does not name, is put to the user;
 * a confirmation records its fingerprint. A rejection, or a dialog that fails,
 * signs the plugin out, revokes the key and rejects with a `LoginError`.
 */
async function acceptIssuedKey(issued: IssuedKey, options: LoginOptions): Promise<void> {
  if (!isConfirmedAccount(issued.fingerprint)) {
    const ask =
      options.confirmAccount ??
      ((key: IssuedKey) =>
        promptAccountConfirm(
          options.win ?? (Zotero.getMainWindow() as unknown as Window | null),
          accountConfirmContent(key.emailMasked),
        ))
    let confirmed: boolean | null
    try {
      confirmed = (await ask(issued)) === true
    } catch (error) {
      logDebug(`account confirmation failed: ${error}`)
      confirmed = null
    }
    if (!confirmed) {
      clearCredentials()
      await revokeIssuedKey(issued)
      throw new LoginError(confirmed === null ? "failed" : "account_rejected")
    }
    if (issued.fingerprint) setPref(CONFIRMED_ACCOUNT_PREF, issued.fingerprint)
  }
  setCredentials(issued.key, issued.base)
}

/**
 * Browser authorization (device flow): opens the consent page in the system
 * browser, polls the backend for the key and keeps it once its account is
 * confirmed. Resolves once signed in and rejects with a `LoginError` that
 * says why it stopped.
 */
export async function startLogin(options: LoginOptions = {}): Promise<void> {
  let verifier: string
  let challenge: string
  try {
    verifier = createCodeVerifier()
    challenge = await codeChallengeFor(verifier)
  } catch {
    throw new LoginError("failed")
  }
  const startUrl =
    `${config.authApiBase}/plugin/authorize/start` +
    `?code_challenge=${encodeURIComponent(challenge)}&code_challenge_method=S256`

  let xhr: XMLHttpRequest
  try {
    xhr = await Zotero.HTTP.request(
      "GET",
      startUrl,
      withPluginIdentity(startUrl, { ...AUTH_REQUEST_OPTIONS }),
    )
  } catch (error) {
    const kind = requestFailureKind(error)
    throw new LoginError(kind === "rejected" ? "failed" : kind)
  }
  let res: any
  try {
    res = JSON.parse(xhr.responseText || "{}")
  } catch {
    throw new LoginError("failed")
  }
  if (!res.authorize_url) throw new LoginError("failed")

  Zotero.launchURL(res.authorize_url)

  // Zotero's XHR is not subject to browser CORS or private network access
  // checks. Sending the state lets the backend answer `expired` once the
  // consent link is no longer valid. `logBodyLength: 0` keeps the verifier out
  // of Zotero's debug output.
  const pollUrl = `${config.authApiBase}/plugin/authorize/poll`
  const pollBody: { code_verifier: string; state?: string } = { code_verifier: verifier }
  if (typeof res.state_token === "string" && res.state_token) {
    pollBody.state = res.state_token
  }
  const pollOptions = {
    ...AUTH_REQUEST_OPTIONS,
    body: JSON.stringify(pollBody),
    headers: { "Content-Type": "application/json" },
    logBodyLength: 0,
  }
  const started = Date.now()
  let unreachableSince: number | null = null
  let lastFailure: "network" | "busy" | null = null
  while (Date.now() - started < AUTH_TIMEOUT_MS) {
    await Zotero.Promise.delay(POLL_INTERVAL_MS)
    let pr: XMLHttpRequest
    try {
      pr = await Zotero.HTTP.request(
        "POST",
        pollUrl,
        withPluginIdentity(pollUrl, { ...pollOptions }),
      )
    } catch (error) {
      const kind = requestFailureKind(error)
      if (kind === "rejected") throw new LoginError("failed")
      lastFailure = kind
      if (kind === "busy") {
        unreachableSince = null
        continue
      }
      unreachableSince ??= Date.now()
      if (Date.now() - unreachableSince >= NETWORK_GIVE_UP_MS) {
        throw new LoginError("network")
      }
      continue
    }
    unreachableSince = null
    let data: any
    try {
      data = JSON.parse(pr.responseText || "{}")
    } catch {
      // A 2xx body that is not JSON comes from a misbehaving server or proxy.
      lastFailure = "busy"
      continue
    }
    lastFailure = null
    const outcome = pollOutcome(data?.status)
    if (outcome === "ready") {
      if (data.api_key && data.api_base_url) {
        await acceptIssuedKey(issuedKeyFrom(data), options)
        void emitTelemetry("login_success")
        return
      }
      continue
    }
    if (outcome !== "pending") throw new LoginError(outcome)
  }
  throw new LoginError(lastFailure ?? "timeout")
}

/** 手动兜底:loopback 不通时,用户从网页复制 Key 粘贴进来(base 默认生产 /v1)。 */
export function manualLogin(key: string, base?: string): void {
  const trimmed = key.trim()
  if (!/^sk_(live|test)_/.test(trimmed)) {
    throw new Error(getString("auth-failed"))
  }
  setCredentials(trimmed, (base || config.defaultApiBase).trim())
  void emitTelemetry("login_success")
}
