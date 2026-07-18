import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { clearPref, getPref, setPref } from "../utils/prefs"
import {
  getServerPort,
  registerPendingAuth,
  unregisterPendingAuth,
} from "./server"

// 授权流 + 凭证存储(GEYI-328)。凭证 = api_key(Bearer)+ api_base_url(/v1 基址,来自
// confirm)。授权走浏览器同意页 → loopback 回写(见 server.ts);失败可手动粘贴 Key。

const AUTH_TIMEOUT_MS = 5 * 60 * 1000

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

/** 浏览器授权:注册一次性回调 → 开系统浏览器 → 等 loopback 回写。resolve=已登录。 */
export async function startLogin(): Promise<void> {
  const nonce = randomNonce()
  const port = getServerPort()
  const startUrl =
    `${config.authApiBase}/plugin/authorize/start` +
    `?nonce=${encodeURIComponent(nonce)}&port=${port}`

  let xhr: XMLHttpRequest
  try {
    xhr = await Zotero.HTTP.request("GET", startUrl, { responseType: "text" })
  } catch {
    throw new Error(getString("auth-failed"))
  }
  const res = JSON.parse(xhr.responseText || "{}")
  if (!res.authorize_url) throw new Error(getString("auth-failed"))

  const done = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      unregisterPendingAuth(nonce)
      reject(new Error(getString("auth-failed")))
    }, AUTH_TIMEOUT_MS)
    registerPendingAuth(nonce, (payload) => {
      clearTimeout(timer)
      if (payload?.api_key && payload?.api_base_url) {
        setCredentials(payload.api_key, payload.api_base_url)
        resolve()
      } else {
        reject(new Error(getString("auth-failed")))
      }
    })
  })

  Zotero.launchURL(res.authorize_url)
  await done
}

/** 手动兜底:loopback 不通时,用户从网页复制 Key 粘贴进来(base 默认生产 /v1)。 */
export function manualLogin(key: string, base?: string): void {
  const trimmed = key.trim()
  if (!/^sk_(live|test)_/.test(trimmed)) {
    throw new Error(getString("auth-failed"))
  }
  setCredentials(trimmed, (base || `${config.webBase}/v1`).trim())
}
