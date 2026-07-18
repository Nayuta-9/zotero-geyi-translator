// 动态字符串本地化(GEYI-328,AC-16)。菜单/对话框/通知等运行期文案走此 JS map,
// 按 Zotero.locale 选中英(preferences 面板的静态 XHTML 亦由 prefsPane 用本表填充,
// 保证单一事实源)。缺键回落英文,再回落 key 本身。

type Dict = Record<string, string>

const EN: Dict = {
  "menu-translate": "Translate with Geyi",
  "menu-translate-preserve": "Translate (keep layout)",
  "menu-retranslate": "Re-translate with Geyi…",
  "dialog-title": "Translate with Geyi",
  "dialog-target": "Target language",
  "dialog-pipeline": "Pipeline",
  "dialog-pipeline-reflow": "AI reflow",
  "dialog-pipeline-preserve": "Keep original layout (PDF)",
  "dialog-precision": "Precision",
  "dialog-precision-high": "High",
  "dialog-precision-standard": "Standard",
  "dialog-formats": "Output formats",
  "dialog-estimate": "Estimated cost",
  "dialog-estimate-loading": "Estimating…",
  "dialog-estimate-credits": "Up to {n} credits (balance: {b})",
  "dialog-insufficient": "Not enough credits. Balance {b}, need up to {n}.",
  "dialog-topup": "Add credits",
  "dialog-submit": "Translate",
  "dialog-cancel": "Cancel",
  "login-required-title": "Sign in required",
  "login-required-body": "Sign in with your Geyi account to translate.",
  "login-now": "Sign in",
  "notify-submitted": "Translation started: {name}",
  "notify-done": "Translation ready: {name}",
  "notify-failed": "Translation failed: {name}",
  "progress-uploading": "Uploading…",
  "progress-translating": "Translating…",
  "progress-done": "Done",
  "no-pdf": "This item has no PDF attachment to translate.",
  "pick-attachment": "This item has multiple PDFs. Right-click a specific PDF attachment instead.",
  "auth-opened-browser": "Opened your browser to authorize. Complete sign-in there.",
  "auth-success": "Signed in to Geyi.",
  "auth-failed": "Sign-in failed. Please try again.",
  "auth-logged-out": "Signed out of Geyi.",
  "pref-account-title": "Account",
  "pref-not-logged-in": "Not signed in",
  "pref-logged-in": "Signed in as {email}",
  "pref-login": "Sign in with Geyi",
  "pref-logout": "Sign out",
  "pref-manual": "Enter key manually",
  "pref-manual-prompt": "Paste the API key shown on the authorization page:",
  "pref-defaults-title": "Default translation settings",
  "pref-target": "Target language",
  "pref-layout": "Pipeline",
  "pref-layout-reflow": "AI reflow",
  "pref-layout-preserve": "Keep original layout (PDF)",
  "pref-precision": "Precision",
  "pref-precision-high": "High",
  "pref-precision-standard": "Standard",
  "pref-notify": "Notify me when a translation finishes",
  "pref-open-web": "Open web console",
  "pref-help": "Download page & help",
}

const ZH: Dict = {
  "menu-translate": "用格译翻译",
  "menu-translate-preserve": "用格译翻译（保留版式）",
  "menu-retranslate": "用格译重新翻译…",
  "dialog-title": "用格译翻译",
  "dialog-target": "目标语言",
  "dialog-pipeline": "管线",
  "dialog-pipeline-reflow": "AI 重排",
  "dialog-pipeline-preserve": "保留原版式（PDF）",
  "dialog-precision": "精度",
  "dialog-precision-high": "高精度",
  "dialog-precision-standard": "标准",
  "dialog-formats": "输出格式",
  "dialog-estimate": "预计消耗",
  "dialog-estimate-loading": "预估中…",
  "dialog-estimate-credits": "最多 {n} 积分（余额：{b}）",
  "dialog-insufficient": "积分不足。余额 {b}，最多需 {n}。",
  "dialog-topup": "去充值",
  "dialog-submit": "翻译",
  "dialog-cancel": "取消",
  "login-required-title": "需要登录",
  "login-required-body": "用你的格译账号登录后即可翻译。",
  "login-now": "登录",
  "notify-submitted": "已开始翻译：{name}",
  "notify-done": "翻译完成：{name}",
  "notify-failed": "翻译失败：{name}",
  "progress-uploading": "上传中…",
  "progress-translating": "翻译中…",
  "progress-done": "完成",
  "no-pdf": "此条目没有可翻译的 PDF 附件。",
  "pick-attachment": "此条目有多个 PDF，请右键某个具体的 PDF 附件。",
  "auth-opened-browser": "已打开浏览器进行授权，请在浏览器里完成登录。",
  "auth-success": "已登录格译。",
  "auth-failed": "登录失败，请重试。",
  "auth-logged-out": "已登出格译。",
  "pref-account-title": "账号",
  "pref-not-logged-in": "未登录",
  "pref-logged-in": "已登录：{email}",
  "pref-login": "用格译登录",
  "pref-logout": "登出",
  "pref-manual": "手动输入密钥",
  "pref-manual-prompt": "粘贴授权页上显示的 API 密钥：",
  "pref-defaults-title": "默认翻译设置",
  "pref-target": "目标语言",
  "pref-layout": "管线",
  "pref-layout-reflow": "AI 重排",
  "pref-layout-preserve": "保留原版式（PDF）",
  "pref-precision": "精度",
  "pref-precision-high": "高精度",
  "pref-precision-standard": "标准",
  "pref-notify": "翻译完成时通知我",
  "pref-open-web": "打开网页控制台",
  "pref-help": "下载页与帮助",
}

function isZh(): boolean {
  try {
    return String((Zotero as any).locale || "").toLowerCase().startsWith("zh")
  } catch {
    return false
  }
}

/** 取本地化字符串;支持 {name} 形式的占位替换。 */
export function getString(key: string, args?: Record<string, string | number>): string {
  const table = isZh() ? ZH : EN
  let s = table[key] ?? EN[key] ?? key
  if (args) {
    for (const [k, v] of Object.entries(args)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v))
    }
  }
  return s
}
