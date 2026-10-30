import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { clearPref, getPref, setPref } from "../utils/prefs"
import { withPluginIdentity } from "../utils/http"
import { emitTelemetry } from "./telemetry"

// 授权流 + 凭证存储(GEYI-328)。凭证 = api_key(Bearer)+ api_base_url(/v1 基址)。
// 登录走 Device Flow:开浏览器同意页 → 插件轮询后端取 Key(避开被 Chrome CORS/PNA 拦
// 的 loopback);失败可手动粘贴 Key。
// The poll also reports why an authorization ended (cancelled in the browser,
// ineligible membership, expired link) so the plugin can stop and explain.
// Each sign-in proves possession of a local code verifier: only its S256
// challenge reaches the start URL and the consent page, and the verifier
// itself travels only in the poll request body.

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

const PLANS_URL = `${config.webBase}/billing?source=zotero_plugin`

/** Why a browser sign-in ended without a key. */
export type LoginFailureReason =
  | "not_eligible"
  | "cancelled"
  | "expired"
  | "timeout"
  | "network"
  | "busy"
  | "failed"

const FAILURE_MESSAGE_KEYS: Record<LoginFailureReason, string> = {
  not_eligible: "login-not-eligible",
  cancelled: "login-cancelled",
  expired: "login-expired",
  timeout: "login-timeout",
  network: "login-network",
  busy: "login-busy",
  failed: "auth-failed",
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
  const e = error as any
  const status = Number(e?.status ?? e?.xmlhttp?.status ?? e?.xhr?.status ?? 0)
  if (status === 429 || (status >= 500 && status < 600)) return "busy"
  if (status >= 400 && status < 500) return "rejected"
  return "network"
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
 * Browser authorization (device flow): opens the consent page in the system
 * browser and polls the backend for the key. Resolves once signed in and
 * rejects with a `LoginError` that says why it stopped.
 */
export async function startLogin(): Promise<void> {
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
        setCredentials(data.api_key, data.api_base_url)
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
