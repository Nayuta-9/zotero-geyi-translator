import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { getPref, setPref } from "../utils/prefs"
import { api } from "../utils/api"
import {
  clearCredentials,
  isLoggedIn,
  manualLogin,
  startLogin,
} from "./auth"

// 设置面板(GEYI-328 · F7 精简版:账户 + 默认偏好)。注册后由 content/prefsPane-init.js
// 在面板 load 时桥接到 onPrefsPaneLoad(bundle 内逻辑无法被 XHTML 直接引用)。

export async function registerPrefsPane(): Promise<void> {
  const addon = (Zotero as any)[config.addonInstance]
  // 去重:同一进程内已注册就不再注册(避免覆盖安装/重复 startup 叠加多个面板)。
  if (addon?.data?.prefsPaneID) return
  const paneID = await (Zotero as any).PreferencePanes.register({
    pluginID: config.addonID,
    src: `chrome://${config.addonRef}/content/preferences.xhtml`,
    label: config.addonName,
    image: `chrome://${config.addonRef}/content/icons/icon.svg`,
    scripts: [`chrome://${config.addonRef}/content/prefsPane-init.js`],
  })
  if (addon?.data) addon.data.prefsPaneID = paneID
}

function setText(doc: Document, id: string, s: string): void {
  const el = doc.getElementById(id)
  if (el) el.textContent = s
}
function setLabel(doc: Document, id: string, s: string): void {
  doc.getElementById(id)?.setAttribute("label", s)
}

export function onPrefsPaneLoad(win: Window): void {
  const doc = win.document

  setText(doc, "geyi-pref-account-title", getString("pref-account-title"))
  setText(doc, "geyi-pref-defaults-title", getString("pref-defaults-title"))
  setText(doc, "geyi-lbl-target", getString("pref-target"))
  setText(doc, "geyi-lbl-layout", getString("pref-layout"))
  setText(doc, "geyi-lbl-precision", getString("pref-precision"))
  setLabel(doc, "geyi-layout-reflow", getString("pref-layout-reflow"))
  setLabel(doc, "geyi-layout-preserve", getString("pref-layout-preserve"))
  setLabel(doc, "geyi-precision-high", getString("pref-precision-high"))
  setLabel(doc, "geyi-precision-standard", getString("pref-precision-standard"))
  setLabel(doc, "geyi-notify", getString("pref-notify"))
  setLabel(doc, "geyi-login-btn", getString("pref-login"))
  setLabel(doc, "geyi-manual-btn", getString("pref-manual"))
  setLabel(doc, "geyi-logout-btn", getString("pref-logout"))
  setLabel(doc, "geyi-open-web", getString("pref-open-web"))
  setLabel(doc, "geyi-help", getString("pref-help"))

  refreshAccount(doc)
  bindDefaults(doc)
  bindButtons(win, doc)
}

function refreshAccount(doc: Document): void {
  const status = doc.getElementById("geyi-account-status")
  const loginBtn = doc.getElementById("geyi-login-btn")
  const manualBtn = doc.getElementById("geyi-manual-btn")
  const logoutBtn = doc.getElementById("geyi-logout-btn")
  const loggedIn = isLoggedIn()
  // 未登录:显示「登录」+「手动输入密钥」;登录:仅显示「登出」。
  for (const b of [loginBtn, manualBtn]) {
    if (loggedIn) b?.setAttribute("hidden", "true")
    else b?.removeAttribute("hidden")
  }
  if (loggedIn) {
    if (status) status.textContent = getString("pref-logged-in", { email: "…" })
    logoutBtn?.removeAttribute("hidden")
    // 异步补上邮箱(best-effort)。
    api
      .me()
      .then((me) => {
        if (status) status.textContent = getString("pref-logged-in", { email: me.email })
      })
      .catch(() => {
        /* 网络失败保持通用文案 */
      })
  } else {
    if (status) status.textContent = getString("pref-not-logged-in")
    logoutBtn?.setAttribute("hidden", "true")
  }
}

function bindDefaults(doc: Document): void {
  const bindMenu = (id: string, prefKey: string) => {
    const el = doc.getElementById(id) as any
    if (!el) return
    const cur = getPref<string>(prefKey)
    if (cur) el.value = cur
    el.addEventListener("command", () => setPref(prefKey, el.value))
  }
  bindMenu("geyi-target-language", "targetLanguage")
  bindMenu("geyi-layout-mode", "layoutMode")
  bindMenu("geyi-precision-mode", "precisionMode")

  const notify = doc.getElementById("geyi-notify") as any
  if (notify) {
    notify.checked = getPref<boolean>("notifyOnComplete") !== false
    notify.addEventListener("command", () =>
      setPref("notifyOnComplete", !!notify.checked),
    )
  }
}

function bindButtons(win: Window, doc: Document): void {
  doc.getElementById("geyi-login-btn")?.addEventListener("command", () => {
    void doLogin(win, doc)
  })
  doc.getElementById("geyi-manual-btn")?.addEventListener("command", () => {
    doManualLogin(win, doc)
  })
  doc.getElementById("geyi-logout-btn")?.addEventListener("command", () => {
    clearCredentials()
    refreshAccount(doc)
  })
  doc.getElementById("geyi-open-web")?.addEventListener("command", () => {
    Zotero.launchURL(`${config.webBase}/api-keys`)
  })
  doc.getElementById("geyi-help")?.addEventListener("command", () => {
    Zotero.launchURL(`${config.webBase}/download`)
  })
}

async function doLogin(win: Window, doc: Document): Promise<void> {
  try {
    await startLogin()
    refreshAccount(doc)
  } catch {
    // 自动授权失败(loopback 被浏览器 CORS/PNA 拦等)→ 引导改用「手动输入密钥」。
    win.alert(getString("auth-failed"))
  }
}

// 手动兜底:用户从网页授权页复制 API 密钥,直接粘贴(不走浏览器 loopback)。
function doManualLogin(win: Window, doc: Document): void {
  const input = { value: "" }
  const ok = (Services as any).prompt.prompt(
    win,
    config.addonName,
    getString("pref-manual-prompt"),
    input,
    null,
    { value: false },
  )
  if (!ok || !input.value.trim()) return
  try {
    manualLogin(input.value)
    refreshAccount(doc)
  } catch {
    win.alert(getString("auth-failed"))
  }
}
