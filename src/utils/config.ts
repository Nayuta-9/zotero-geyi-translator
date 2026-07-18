// 插件常量(GEYI-328)。与 package.json 的 config 保持一致;硬编码在 src 单文件,避免
// 打包侧占位符替换的复杂性(这些值稳定,rarely 改)。
export const config = {
  addonID: "geyi-zotero-translator@geyi.net",
  addonRef: "geyi",
  addonInstance: "GeyiTranslator",
  addonName: "Geyi Translator",
  prefsPrefix: "extensions.zotero.geyi",

  // 网页端根域(下载页/控制台/授权同意页)。
  webBase: "https://www.geyi.net",
  // 授权流后端(GEYI-326 的 /api/v1/plugin/authorize/*)。dogfood 可覆盖(见 prefs
  // 的 authApiOverride,隐藏项)。
  authApiBase: "https://www.geyi.net/api/v1",
  // 前端同意页(插件在系统浏览器打开的落点由后端 start 返回,这里仅作兜底展示)。
  authorizePage: "https://www.geyi.net/plugin/authorize",
  // 浏览器把 Key 回写的本机回调路径(与 GEYI-327 前端约定一致)。
  loopbackPath: "/geyi/auth-callback",
} as const
