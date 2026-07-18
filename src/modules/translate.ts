import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { getPref } from "../utils/prefs"
import {
  api,
  ApiError,
  LARGE_FILE_THRESHOLD,
  type Job,
  type TranslateOptions,
} from "../utils/api"
import { isLoggedIn, startLogin } from "./auth"

// 单文件翻译主路径(GEYI-328 · F3):右键 → 配置 → 预估 → 提交 → 轮询 → 回填子附件。
// 富回填(版本号/note/去重)属 F5/GEYI-329;此处实现端到端的基础回填(挂回 + 打 tag)。

const MENU_ID = `${config.addonRef}-menu-translate`
const POLL_INTERVAL_MS = 3000
const POLL_MAX = 20 * 60 * 1000 / POLL_INTERVAL_MS // 20 分钟上限

function ztk(): any {
  return (Zotero as any)[config.addonInstance]?.data.ztoolkit
}

// ── 菜单 ─────────────────────────────────────────────────────────────────────

export function registerMenus(win: Window): void {
  const zt = ztk()
  if (!zt) return
  zt.Menu.register("item", {
    tag: "menuitem",
    id: MENU_ID,
    label: getString("menu-translate"),
    icon: `chrome://${config.addonRef}/content/icons/icon.svg`,
    commandListener: () => void onTranslateCommand(win),
  })
}

export function unregisterMenus(_win: Window): void {
  try {
    ztk()?.Menu.unregister(MENU_ID)
  } catch {
    /* ignore */
  }
}

// ── 附件解析 ─────────────────────────────────────────────────────────────────

async function resolvePdfAttachment(win: Window): Promise<Zotero.Item | null> {
  const pane = (win as any).ZoteroPane
  const items: Zotero.Item[] = pane?.getSelectedItems?.() || []
  if (!items.length) return null

  // 直接选中的就是 PDF 附件。
  const direct = items.find(
    (it) => it.isAttachment() && it.attachmentContentType === "application/pdf",
  )
  if (direct) return direct

  // 选中的是常规条目 → 找其 PDF 附件。
  const regular = items.find((it) => it.isRegularItem())
  if (!regular) {
    win.alert(getString("no-pdf"))
    return null
  }
  const attIDs = regular.getAttachments()
  const atts = Zotero.Items.get(attIDs).filter(
    (a) => a.attachmentContentType === "application/pdf",
  )
  if (atts.length === 0) {
    win.alert(getString("no-pdf"))
    return null
  }
  if (atts.length > 1) {
    win.alert(getString("pick-attachment"))
    return null
  }
  return atts[0]
}

async function readBytes(att: Zotero.Item): Promise<Uint8Array> {
  const path = await att.getFilePathAsync()
  if (!path) throw new Error(getString("no-pdf"))
  return (await (globalThis as any).IOUtils.read(path)) as Uint8Array
}

// ── 主命令 ───────────────────────────────────────────────────────────────────

async function onTranslateCommand(win: Window): Promise<void> {
  if (!isLoggedIn()) {
    const go = win.confirm(
      `${getString("login-required-title")}\n\n${getString("login-required-body")}`,
    )
    if (!go) return
    try {
      await startLogin()
      new (ztk().ProgressWindow)(config.addonName)
        .createLine({ text: getString("auth-success"), type: "success" })
        .show()
    } catch {
      win.alert(getString("auth-failed"))
      return
    }
  }

  const att = await resolvePdfAttachment(win)
  if (!att) return

  const opts = await openConfigDialog(win)
  if (!opts) return

  await runTranslation(win, att, opts)
}

// ── 配置对话框(toolkit Dialog;字段:目标语言 / 管线 / 精度)────────────────

function selectRow(
  labelKey: string,
  dataKey: string,
  options: [string, string][],
): any {
  return {
    tag: "div",
    styles: { display: "flex", alignItems: "center", gap: "8px", margin: "6px 0" },
    children: [
      { tag: "label", styles: { flex: "1" }, properties: { innerHTML: getString(labelKey) } },
      {
        tag: "select",
        attributes: { "data-bind": dataKey, "data-prop": "value" },
        children: options.map(([value, label]) => ({
          tag: "option",
          properties: { value, innerHTML: label },
        })),
      },
    ],
  }
}

async function openConfigDialog(win: Window): Promise<TranslateOptions | null> {
  const zt = ztk()
  if (!zt) return null

  const data: Record<string, any> = {
    targetLanguage: getPref<string>("targetLanguage") || "zh-CN",
    layoutMode: getPref<string>("layoutMode") || "reflow",
    precisionMode: getPref<string>("precisionMode") || "high",
  }

  const dialog = new zt.Dialog(5, 1)
    .addCell(0, 0, {
      tag: "h2",
      properties: { innerHTML: getString("dialog-title") },
    })
    .addCell(1, 0, selectRow("dialog-target", "targetLanguage", [
      ["zh-CN", "简体中文"],
      ["zh-TW", "繁體中文"],
      ["en", "English"],
      ["ja", "日本語"],
      ["ko", "한국어"],
    ]))
    .addCell(2, 0, selectRow("dialog-pipeline", "layoutMode", [
      ["reflow", getString("dialog-pipeline-reflow")],
      ["preserve", getString("dialog-pipeline-preserve")],
    ]))
    .addCell(3, 0, selectRow("dialog-precision", "precisionMode", [
      ["high", getString("dialog-precision-high")],
      ["standard", getString("dialog-precision-standard")],
    ]))
    .addButton(getString("dialog-submit"), "submit")
    .addButton(getString("dialog-cancel"), "cancel")
    .setDialogData(data)

  dialog.open(getString("dialog-title"), { centerscreen: true, resizable: true })
  await data.unloadLock?.promise

  if (data._lastButtonId !== "submit") return null
  return {
    targetLanguage: data.targetLanguage,
    layoutMode: data.layoutMode,
    precisionMode: data.precisionMode,
    bilingual: false,
    speed: "fast",
  }
}

// ── 提交 + 轮询 + 回填 ───────────────────────────────────────────────────────

async function runTranslation(
  win: Window,
  att: Zotero.Item,
  opts: TranslateOptions,
): Promise<void> {
  const zt = ztk()
  const origName = (att.attachmentFilename || "document.pdf").replace(/\.pdf$/i, "")
  const pw = new zt.ProgressWindow(config.addonName, { closeOnClick: false })
  pw.createLine({ text: getString("progress-uploading"), type: "default", progress: 5 }).show()

  let bytes: Uint8Array
  try {
    bytes = await readBytes(att)
  } catch (e: any) {
    pw.changeLine({ text: e?.message || getString("notify-failed", { name: origName }), type: "fail" })
    pw.startCloseTimer(4000)
    return
  }

  const file = { name: `${origName}.pdf`, bytes, contentType: "application/pdf" }

  // 预估 + 余额预检(场景 D)。小文件走精确预估;大文件不为估价重复上传整份,退而查
  // 余额。预检失败不阻断(后端结算兜底)。
  try {
    let available: number
    let need: number | string
    if (file.bytes.length < LARGE_FILE_THRESHOLD) {
      const est = await api.estimate(file, opts)
      available = est.available_credits
      need = est.estimated_credits
      if (est.sufficient_balance) available = Number.POSITIVE_INFINITY
    } else {
      const acct = await api.me()
      available = acct.available > 0 ? Number.POSITIVE_INFINITY : 0
      need = "?"
    }
    if (available !== Number.POSITIVE_INFINITY) {
      pw.close()
      const topup = win.confirm(
        `${getString("dialog-insufficient", { b: available, n: need })}\n\n${getString("dialog-topup")}?`,
      )
      if (topup) Zotero.launchURL(`${config.webBase}/billing`)
      return
    }
  } catch (e) {
    Zotero.debug(`[geyi] preflight failed: ${e}`)
  }

  let job: Job
  try {
    job = await api.createTranslation(file, opts)
  } catch (e: any) {
    const msg = e instanceof ApiError ? e.message : getString("notify-failed", { name: origName })
    pw.changeLine({ text: msg, type: "fail" })
    pw.startCloseTimer(5000)
    return
  }

  pw.changeLine({ text: getString("progress-translating"), type: "default", progress: 20 })
  await pollAndAttach(win, job.id, att, origName, opts, pw)
}

async function pollAndAttach(
  win: Window,
  jobId: string,
  att: Zotero.Item,
  origName: string,
  opts: TranslateOptions,
  pw: any,
): Promise<void> {
  const addon = (Zotero as any)[config.addonInstance]
  let stopped = false
  const stop = () => { stopped = true }
  addon?.data.activePolls.set(jobId, stop)

  let ticks = 0
  const parentID = att.parentItemID || att.id

  while (!stopped && ticks < POLL_MAX) {
    await Zotero.Promise.delay(POLL_INTERVAL_MS)
    ticks++
    let job: Job
    try {
      job = await api.getJob(jobId)
    } catch {
      continue // 瞬时错误,继续轮询
    }
    if (job.progress != null) {
      pw.changeLine({ progress: Math.max(20, Math.min(95, job.progress)) })
    }
    if (job.status === "succeeded") {
      addon?.data.activePolls.delete(jobId)
      try {
        await attachOutputs(jobId, parentID as number, origName, opts)
        pw.changeLine({ text: getString("notify-done", { name: origName }), type: "success", progress: 100 })
      } catch (e: any) {
        pw.changeLine({ text: e?.message || getString("notify-failed", { name: origName }), type: "fail" })
      }
      pw.startCloseTimer(5000)
      notify(win, getString("notify-done", { name: origName }))
      return
    }
    if (job.status === "failed" || job.status === "canceled") {
      addon?.data.activePolls.delete(jobId)
      pw.changeLine({ text: job.error || getString("notify-failed", { name: origName }), type: "fail" })
      pw.startCloseTimer(6000)
      return
    }
  }
  addon?.data.activePolls.delete(jobId)
}

// 挑主产物挂回:reflow → 优先 pdf;preserve → pdf。把译文作为子附件挂回同一条目。
async function attachOutputs(
  jobId: string,
  parentID: number,
  origName: string,
  opts: TranslateOptions,
): Promise<void> {
  const { outputs } = await api.listOutputs(jobId)
  const preferred = outputs.find((o) => o.format === "pdf") || outputs[0]
  if (!preferred) throw new Error("no output")

  const dl = await api.getDownloadUrl(jobId, preferred.format)
  const resp: any = await Zotero.HTTP.request("GET", dl.url, { responseType: "arraybuffer" })
  const bytes = new Uint8Array(resp.response)

  const suffix = opts.layoutMode === "preserve" ? "preserve" : opts.targetLanguage.split("-")[0]
  const outName = `${origName}_${suffix}.${preferred.format === "pdf" ? "pdf" : preferred.format}`
  const tmpPath = (globalThis as any).PathUtils.join(Zotero.getTempDirectory().path, outName)
  await (globalThis as any).IOUtils.write(tmpPath, bytes)

  const newAtt = await Zotero.Attachments.importFromFile({
    file: tmpPath,
    parentItemID: parentID,
  })
  newAtt.addTag("格译-译文")
  newAtt.addTag(opts.layoutMode === "preserve" ? "格译-管线:原版保留" : "格译-管线:AI重排")
  await newAtt.saveTx()

  try {
    await (globalThis as any).IOUtils.remove(tmpPath)
  } catch {
    /* 临时文件清理失败不影响结果 */
  }
}

function notify(win: Window, text: string): void {
  try {
    if (!(win as any).document.hasFocus?.()) {
      new (win as any).Notification(config.addonName, { body: text })
    }
  } catch {
    /* 系统通知不可用即忽略 */
  }
}
