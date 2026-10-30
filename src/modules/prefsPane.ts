import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { getPref, setPref } from "../utils/prefs"
import { logDebug } from "../utils/log"
import {
  clearCredentials,
  isLoggedIn,
  manualLogin,
  showLoginFailure,
  startLogin,
} from "./auth"
import { clearGlossaryCache, getGlossaries } from "./glossary"
import {
  type AccountSnapshot,
  clearAccountCache,
  FEATURE_MIN_TIER,
  getAccountSnapshot,
  hasFeature,
  MEMBER_FEATURE,
  type MemberFeature,
} from "./memberFeatures"
import { loadTrackedTasks } from "./taskState"
import { emitTelemetry } from "./telemetry"
import {
  LARGE_DOCUMENT_MIN_PAGES,
  resolveConcurrencyCap,
} from "./translationPolicy"

// 设置面板(GEYI-328 · F7 精简版:账户 + 默认偏好)。注册后由 content/prefsPane-init.js
// 在面板 load 时桥接到 onPrefsPaneLoad(bundle 内逻辑无法被 XHTML 直接引用)。

export async function registerPrefsPane(): Promise<void> {
  const addon = (Zotero as any)[config.addonInstance]
  // 去重:同一进程内已注册就不再注册(避免覆盖安装/重复 startup 叠加多个面板)。
  if (addon?.data?.prefsPaneID) return
  // src/image/scripts 用相对插件 root 的路径(Zotero 官方文档口径),而非 chrome:// —
  // 实测 chrome:// 的 scripts 不被面板加载器执行(桥接脚本从不运行,面板文案全空)。
  const paneID = await (Zotero as any).PreferencePanes.register({
    pluginID: config.addonID,
    src: "content/preferences.xhtml",
    label: config.addonName,
    image: "content/icons/icon.svg",
    scripts: ["content/prefsPane-init.js"],
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
  try {
    logDebug(`onPrefsPaneLoad; probe=${!!doc.getElementById("geyi-account-status")}`)
  } catch {
    /* ignore */
  }

  setText(doc, "geyi-pref-account-title", getString("pref-account-title"))
  setText(doc, "geyi-pref-defaults-title", getString("pref-defaults-title"))
  setText(doc, "geyi-pref-advanced-title", getString("pref-advanced-title"))
  setText(doc, "geyi-pref-about-title", getString("pref-about-title"))
  setText(doc, "geyi-lbl-target", getString("pref-target"))
  setText(doc, "geyi-lbl-layout", getString("pref-layout"))
  setText(doc, "geyi-lbl-precision", getString("pref-precision"))
  setText(doc, "geyi-lbl-output", getString("pref-output"))
  setText(doc, "geyi-lbl-concurrency", getString("pref-concurrency"))
  setText(doc, "geyi-lbl-log-level", getString("pref-log-level"))
  setText(doc, "geyi-upload-strategy", getString("pref-upload-strategy"))
  setText(doc, "geyi-version", getString("pref-version", { version: config.version }))
  setLabel(doc, "geyi-layout-reflow", getString("pref-layout-reflow"))
  setLabel(doc, "geyi-layout-preserve", getString("pref-layout-preserve"))
  setLabel(doc, "geyi-precision-high", getString("pref-precision-high"))
  setLabel(doc, "geyi-precision-standard", getString("pref-precision-standard"))
  setLabel(doc, "geyi-output-pdf", getString("pref-output-pdf"))
  setLabel(doc, "geyi-output-bilingual", getString("pref-output-bilingual"))
  setLabel(doc, "geyi-output-docx", getString("pref-output-docx"))
  setLabel(doc, "geyi-auto-note", getString("pref-auto-note"))
  setLabel(doc, "geyi-notify", getString("pref-notify"))
  setLabel(doc, "geyi-log-error", getString("pref-log-error"))
  setLabel(doc, "geyi-log-info", getString("pref-log-info"))
  setLabel(doc, "geyi-log-debug", getString("pref-log-debug"))
  setLabel(doc, "geyi-login-btn", getString("pref-login"))
  setLabel(doc, "geyi-manual-btn", getString("pref-manual"))
  setLabel(doc, "geyi-logout-btn", getString("pref-logout"))
  setLabel(doc, "geyi-upgrade-btn", getString("pref-upgrade"))
  setLabel(doc, "geyi-open-web", getString("pref-open-web"))
  setLabel(doc, "geyi-manage-glossary", getString("pref-manage-glossary"))
  setLabel(doc, "geyi-help", getString("pref-help"))
  setLabel(doc, "geyi-feedback", getString("pref-feedback"))
  setLabel(doc, "geyi-privacy", getString("pref-privacy"))

  refreshAccount(doc)
  bindDefaults(doc)
  bindButtons(win, doc)
}

/**
 * 给下拉里的某一项上锁(GEYI-422)。
 *
 * 除了 disabled,还把 label 改成带锁后缀 —— XUL 的 menulist 在收起态显示的是**当前
 * 选中项**的 label,如果用户之前选了双语对照、之后降了档,只设 disabled 的话他看到的
 * 仍是「双语对照 PDF」,像是还选着且没有任何提示。改 label 才能让锁在收起态可见。
 */
function applyLock(
  doc: Document,
  id: string,
  baseLabel: string,
  locked: boolean,
  feature: MemberFeature,
): void {
  const el = doc.getElementById(id)
  if (!el) return
  if (!locked) {
    el.removeAttribute("disabled")
    el.setAttribute("label", baseLabel)
    return
  }
  el.setAttribute("disabled", "true")
  el.setAttribute(
    "label",
    getString("pref-locked-suffix", {
      label: baseLabel,
      lock: getString(`pref-locked-${FEATURE_MIN_TIER[feature]}`),
    }),
  )
}

/**
 * 按账户快照渲染会员相关的一切。三态各有各的渲染策略,**不能合并**:
 *
 * - `unknown`(未登录 / 离线 / 旧后端没下发权益)→ 什么都不知道,一律不锁。把未知
 *   当成「没权益」会在网络抖动时把付费用户的选项全灰掉。
 * - `expired`(/v1/me 明确返回 403)→ 这是确定的负面事实。会员过期时后端在 deps 层
 *   就拦下整把 Key,插件永远拿不到「空 member_features」,只会拿到 403;若把它并进
 *   unknown,页面就会写着「已登录」、所有选项可点,点了全 403 —— 那正是改动前的症状。
 * - `ok` → 按 member_features 逐项上锁。
 */
function applyMembership(doc: Document, snapshot: AccountSnapshot): void {
  const status = doc.getElementById("geyi-account-status")
  const detail = doc.getElementById("geyi-account-detail")
  const hint = doc.getElementById("geyi-membership-hint")
  const upgradeBtn = doc.getElementById("geyi-upgrade-btn")

  if (snapshot.state === "unknown") {
    // 不动任何锁,也不改状态行 —— 保持 refreshAccount 已经填好的通用文案。
    if (hint) hint.textContent = ""
    upgradeBtn?.setAttribute("hidden", "true")
    return
  }

  // GEYI-528：慢速档已撤除，设置页不再有速度档行，相关 applyLock / 提示语一并移除。
  const bilingualLocked = hasFeature(snapshot, MEMBER_FEATURE.BILINGUAL) === false
  const glossaryLocked = hasFeature(snapshot, MEMBER_FEATURE.GLOSSARY) === false

  applyLock(
    doc,
    "geyi-output-bilingual",
    getString("pref-output-bilingual"),
    bilingualLocked,
    MEMBER_FEATURE.BILINGUAL,
  )

  if (snapshot.state === "expired") {
    if (status) status.textContent = getString("pref-membership-expired")
    if (detail) detail.textContent = ""
    if (hint) hint.textContent = getString("pref-membership-expired-hint")
    upgradeBtn?.removeAttribute("hidden")
    return
  }

  upgradeBtn?.setAttribute("hidden", "true")
  if (hint) hint.textContent = glossaryLocked ? getString("pref-glossary-locked") : ""

  // 并发上限的权威在后端:输入框的 max 与当前值都跟着档位走(bindDefaults 是同步的,
  // 拿不到账户,所以只能在这里回填)。
  const account = snapshot.account
  const backendCap = account?.concurrent_translate_limit
  if (typeof backendCap === "number" && backendCap > 0) {
    const input = doc.getElementById("geyi-concurrency") as HTMLInputElement | null
    if (input) {
      input.max = String(backendCap)
      input.value = String(
        resolveConcurrencyCap(getPref<number>("maxConcurrentTasks"), backendCap),
      )
    }
  }
}

function refreshAccount(doc: Document): void {
  const status = doc.getElementById("geyi-account-status")
  const detail = doc.getElementById("geyi-account-detail")
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
    // 强刷:面板每次打开都取最新权益,保证「刚在网页升了级,回来就解锁」。
    void getAccountSnapshot(true)
      .then(async (snapshot) => {
        const me = snapshot.account
        if (me && status) {
          status.textContent = getString("pref-logged-in", { email: me.email })
        }
        if (me && detail) {
          let glossaryCount: string | number = "—"
          try {
            glossaryCount = (await getGlossaries()).count
          } catch {
            /* 账户信息仍可展示 */
          }
          detail.textContent = getString("pref-account-detail", {
            available: me.available,
            held: me.held,
            tier: me.membership_active
              ? me.membership_tier || getString("pref-membership-active")
              : getString("pref-membership-inactive"),
            glossary: glossaryCount,
          })
        }
        applyMembership(doc, snapshot)
      })
      .catch(() => {
        /* getAccountSnapshot 自己吞了错误并返回 unknown;这里兜住渲染期异常 */
      })
  } else {
    if (status) status.textContent = getString("pref-not-logged-in")
    if (detail) detail.textContent = ""
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
  bindMenu("geyi-output-format", "outputFormats")
  bindMenu("geyi-log-level", "logLevel")

  const concurrency = doc.getElementById("geyi-concurrency") as HTMLInputElement | null
  if (concurrency) {
    // 上限的权威在后端(按档位 1/3/8),这里先按回落值渲染,账户回来后由
    // applyMembership 回填真实上限 —— bindDefaults 是同步的,拿不到账户。
    concurrency.value = String(
      resolveConcurrencyCap(getPref<number>("maxConcurrentTasks"), undefined),
    )
    concurrency.addEventListener("input", () => {
      const cap = Number.parseInt(concurrency.max, 10) || 3
      const value = Math.max(1, Math.min(cap, Number.parseInt(concurrency.value, 10) || 1))
      concurrency.value = String(value)
      setPref("maxConcurrentTasks", value)
    })
  }

  const autoNote = doc.getElementById("geyi-auto-note") as any
  if (autoNote) {
    autoNote.checked = getPref<boolean>("autoNote") !== false
    autoNote.addEventListener("command", () => setPref("autoNote", !!autoNote.checked))
  }

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
    clearGlossaryCache()
    clearAccountCache()
    refreshAccount(doc)
  })
  // 升级入口:清缓存再跳,这样用户在网页升完档切回来,面板一刷新就能解锁。
  doc.getElementById("geyi-upgrade-btn")?.addEventListener("command", () => {
    clearAccountCache()
    void emitTelemetry("click_upgrade")
    Zotero.launchURL(`${config.webBase}/billing?source=zotero_plugin`)
  })
  doc.getElementById("geyi-open-web")?.addEventListener("command", () => {
    Zotero.launchURL(`${config.webBase}/api-keys`)
  })
  doc.getElementById("geyi-help")?.addEventListener("command", () => {
    Zotero.launchURL(`${config.webBase}/download`)
  })
  doc.getElementById("geyi-manage-glossary")?.addEventListener("command", () => {
    Zotero.launchURL(`${config.webBase}/glossary`)
  })
  doc.getElementById("geyi-feedback")?.addEventListener("command", () => {
    void emitTelemetry("click_ticket", loadTrackedTasks()[0]?.jobId)
    Zotero.launchURL(feedbackUrl())
  })
  doc.getElementById("geyi-privacy")?.addEventListener("command", () => {
    Zotero.launchURL(`${config.webBase}/privacy`)
  })
}

function feedbackUrl(): string {
  const recent = loadTrackedTasks()[0]
  const params = new URLSearchParams({
    source: `Zotero Plugin ${config.version}`,
    os: String((Services as any).appinfo?.OS || "unknown"),
    zotero_version: String((Zotero as any).version || "unknown"),
  })
  if (recent) params.set("task_id", recent.jobId)
  return `${config.webBase}/tickets?${params.toString()}`
}

async function doLogin(win: Window, doc: Document): Promise<void> {
  try {
    await startLogin({ win })
  } catch (error) {
    showLoginFailure(win, error)
  }
  refreshAccount(doc)
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
