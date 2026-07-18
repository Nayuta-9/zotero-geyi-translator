import { config } from "../utils/config"

// Zotero 内置 Server(127.0.0.1:23119)上的授权回调端点(GEYI-328,对接 GEYI-327)。
// 前端同意页确认后,浏览器 POST {state:nonce, api_key, api_base_url, ...} 到
// http://127.0.0.1:<port>/geyi/auth-callback。本端点按 nonce 找到 pending 处理器交付。
//
// 跨域要点:请求来自 https://www.geyi.net(public) → 本机(loopback/private),Chrome
// 触发 CORS + Private Network Access 预检。故 OPTIONS 预检回 Access-Control-Allow-
// Private-Network:true + CORS 头;POST 响应亦带 CORS。若某 Zotero 版本不支持自定义
// 响应头,前端会读不到响应而回落「手动复制」——流程仍可完成。

type CallbackHandler = (payload: any) => void
const handlers = new Map<string, CallbackHandler>()

export function registerPendingAuth(nonce: string, handler: CallbackHandler): void {
  handlers.set(nonce, handler)
}
export function unregisterPendingAuth(nonce: string): void {
  handlers.delete(nonce)
}

export function getServerPort(): number {
  try {
    return Number(Zotero.Prefs.get("httpServer.port", true)) || 23119
  } catch {
    return 23119
  }
}

let registered = false

const CORS = {
  "Access-Control-Allow-Origin": config.webBase,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Private-Network": "true",
} as const

export function registerAuthEndpoint(): void {
  if (registered) return
  const server = (Zotero as any).Server
  if (!server?.Endpoints) return
  registered = true

  const Endpoint = function () {}
  Endpoint.prototype = {
    supportedMethods: ["POST", "OPTIONS"],
    supportedDataTypes: ["application/json", "text/plain"],
    init(request: any) {
      if (request.method === "OPTIONS") {
        return { status: 200, headers: { ...CORS }, contentType: "text/plain", body: "" }
      }
      try {
        const data =
          typeof request.data === "string" ? JSON.parse(request.data) : request.data
        const nonce = data?.state
        const handler = nonce ? handlers.get(nonce) : undefined
        if (!handler) {
          return {
            status: 403,
            headers: { ...CORS },
            contentType: "application/json",
            body: JSON.stringify({ ok: false, error: "unknown state" }),
          }
        }
        handlers.delete(nonce)
        try {
          handler(data)
        } catch (e) {
          Zotero.debug(`[geyi] auth handler error: ${e}`)
        }
        return {
          status: 200,
          headers: { ...CORS },
          contentType: "application/json",
          body: JSON.stringify({ ok: true }),
        }
      } catch (e: any) {
        return {
          status: 400,
          headers: { ...CORS },
          contentType: "application/json",
          body: JSON.stringify({ ok: false, error: String(e?.message || e) }),
        }
      }
    },
  }
  server.Endpoints[config.loopbackPath] = Endpoint
}
