// 插件常量(GEYI-328)。与 package.json 的 config 保持一致;硬编码在 src 单文件,避免
// 打包侧占位符替换的复杂性(这些值稳定,rarely 改)。
export const config = {
  addonID: "geyi-zotero-translator@geyi.net",
  addonRef: "geyi",
  addonInstance: "GeyiTranslator",
  addonName: "Geyi Translator",
  prefsPrefix: "extensions.zotero.geyi",

  // 网页端根域(下载页/控制台/授权同意页)。www.geyi.net 只有前端 nginx(SPA),
  // /api 与 /v1 不路由到后端 —— 故这些网页 URL 走 webBase,而 API 调用必须直连后端。
  webBase: "https://www.geyi.net",
  // 授权流后端(GEYI-326 的 /api/v1/plugin/authorize/*)。**必须是后端本身**,不能用
  // www.geyi.net(那是前端,/api/v1 会被 SPA 兜底成 HTML → JSON.parse 失败即"登录失败")。
  // 当前直连后端 Cloud Run(与前端 .env.production 的 VITE_API_URL 同一后端);对外域名
  // api.<域> 配好后改这里两行即可。
  authApiBase: "https://translator-backend-78085454326.asia-southeast1.run.app/api/v1",
  // /v1 调用兜底基址(正常由 confirm 回传 api_base_url;手动登录时用此)。
  defaultApiBase: "https://translator-backend-78085454326.asia-southeast1.run.app/v1",
  // 前端同意页(插件在系统浏览器打开的落点由后端 start 返回,这里仅作兜底展示)。
  authorizePage: "https://www.geyi.net/plugin/authorize",
  // 浏览器把 Key 回写的本机回调路径(与 GEYI-327 前端约定一致)。
  loopbackPath: "/geyi/auth-callback",
} as const
