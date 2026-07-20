import { config } from "./config"

/**
 * 为插件网络请求附加稳定客户端身份。CookieSandbox 设置真实 User-Agent；
 * X-Geyi-Client 是网关/代理剥离 UA 时的等价兜底标记。
 */
export function withPluginIdentity(
  url: string,
  options: Record<string, any> = {},
): Record<string, any> {
  let cookieSandbox: unknown
  try {
    cookieSandbox = new (Zotero as any).CookieSandbox(null, url, "", config.userAgent)
  } catch {
    /* 某些 Zotero 构建不允许无 browser 的 CookieSandbox,保留自定义头兜底。 */
  }
  return {
    ...options,
    headers: {
      "X-Geyi-Client": config.userAgent,
      ...(options.headers || {}),
    },
    ...(cookieSandbox ? { cookieSandbox } : {}),
  }
}
