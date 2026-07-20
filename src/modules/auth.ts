import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { clearPref, getPref, setPref } from "../utils/prefs"
import { withPluginIdentity } from "../utils/http"
import { emitTelemetry } from "./telemetry"

// 授权流 + 凭证存储(GEYI-328)。凭证 = api_key(Bearer)+ api_base_url(/v1 基址)。
// 登录走 Device Flow:开浏览器同意页 → 插件轮询后端取 Key(避开被 Chrome CORS/PNA 拦
// 的 loopback);失败可手动粘贴 Key。

const AUTH_TIMEOUT_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 2000

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

function randomNonce(): string {
  const a = new Uint8Array(24)
  ;(globalThis.crypto as Crypto).getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** 浏览器授权(Device Flow):开系统浏览器同意页 → 轮询后端取 Key。resolve=已登录。 */
export async function startLogin(): Promise<void> {
  const nonce = randomNonce()
  const startUrl =
    `${config.authApiBase}/plugin/authorize/start?nonce=${encodeURIComponent(nonce)}`

  let xhr: XMLHttpRequest
  try {
    xhr = await Zotero.HTTP.request(
      "GET",
      startUrl,
      withPluginIdentity(startUrl, { responseType: "text" }),
    )
  } catch {
    throw new Error(getString("auth-failed"))
  }
  const res = JSON.parse(xhr.responseText || "{}")
  if (!res.authorize_url) throw new Error(getString("auth-failed"))

  Zotero.launchURL(res.authorize_url)

  // 轮询后端取 Key(每 2s,最多 5 分钟)。Zotero 的 XHR 不受浏览器 CORS/PNA 约束,
  // 用户在浏览器批准后,poll 返回 status=ready 即拿到现签发的 Key。
  const pollUrl =
    `${config.authApiBase}/plugin/authorize/poll?nonce=${encodeURIComponent(nonce)}`
  const started = Date.now()
  while (Date.now() - started < AUTH_TIMEOUT_MS) {
    await Zotero.Promise.delay(POLL_INTERVAL_MS)
    let pr: XMLHttpRequest
    try {
      pr = await Zotero.HTTP.request(
        "GET",
        pollUrl,
        withPluginIdentity(pollUrl, { responseType: "text" }),
      )
    } catch {
      continue // 瞬时错误继续轮询
    }
    let data: any
    try {
      data = JSON.parse(pr.responseText || "{}")
    } catch {
      continue
    }
    if (data.status === "ready" && data.api_key && data.api_base_url) {
      setCredentials(data.api_key, data.api_base_url)
      void emitTelemetry("login_success")
      return
    }
  }
  throw new Error(getString("auth-failed"))
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
