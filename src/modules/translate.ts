import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { getPref } from "../utils/prefs"
import { withPluginIdentity } from "../utils/http"
import { logDebug } from "../utils/log"
import { api, ApiError, type Job, type OutputItem, type TranslateOptions } from "../utils/api"
import { isLoggedIn, startLogin } from "./auth"
import { getGlossaries } from "./glossary"
import { refreshTaskPane } from "./taskPane"
import { emitTelemetry } from "./telemetry"
import {
  automaticSpeedMode,
  LARGE_DOCUMENT_MIN_PAGES,
} from "./translationPolicy"
import {
  addVersionSuffix,
  getTrackedTask,
  isActiveStatus,
  loadTrackedTasks,
  nextVersion,
  outputBaseName,
  type DuplicateChoice,
  type TrackedTask,
  updateTrackedJob,
  upsertTrackedTask,
} from "./taskState"

// GEYI-329:任务在偏好中持久化,活动时每 3 秒轮询;重启后用 GET /v1/translations
// 恢复插件自己记录的 job id。服务端列表按用户归集,因此必须再与本地 id 交集,
// 才满足 MVP「只显示插件自身发起任务」。

const MENU_ID = `${config.addonRef}-menu-translate`
const POLL_INTERVAL_MS = 3000
const finalizingJobs = new Set<string>()

function ztk(): any {
  return (Zotero as any)[config.addonInstance]?.data.ztoolkit
}

function mainWindow(): Window | undefined {
  return Zotero.getMainWindows()[0] as unknown as Window | undefined
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

  const direct = items.find(
    (it) => it.isAttachment() && it.attachmentContentType === "application/pdf",
  )
  if (direct) return direct

  const regular = items.find((it) => it.isRegularItem())
  if (!regular) {
    win.alert(getString("no-pdf"))
    return null
  }
  const atts = Zotero.Items.get(regular.getAttachments()).filter(
    (item) => item.attachmentContentType === "application/pdf",
  )
  if (!atts.length) {
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

async function getItemByKey(libraryID: number, key: string): Promise<Zotero.Item | null> {
  const item = await Zotero.Items.getByLibraryAndKeyAsync(libraryID, key)
  return item || null
}

function hasTag(item: Zotero.Item, tag: string): boolean {
  return item.getTags().some((entry) => entry.tag === tag)
}

function pipelineTag(layoutMode: string): string {
  return layoutMode === "preserve" ? "格译-管线:原版保留" : "格译-管线:AI重排"
}

function relatedTranslations(att: Zotero.Item, opts: TranslateOptions): Zotero.Item[] {
  const parent = att.parentItem
  if (!parent) return []
  const prefix = `${(att.attachmentFilename || "document.pdf").replace(/\.pdf$/i, "")}_`
  return Zotero.Items.get(parent.getAttachments()).filter(
    (item) =>
      item.id !== att.id &&
      item.isAttachment() &&
      hasTag(item, "格译-译文") &&
      hasTag(item, pipelineTag(opts.layoutMode)) &&
      (item.attachmentFilename || "").startsWith(prefix),
  )
}

function chooseDuplicateMode(
  win: Window,
  existing: Zotero.Item[],
): { choice: DuplicateChoice; overwriteItemKeys: string[] } | null {
  if (!existing.length) return { choice: "version", overwriteItemKeys: [] }
  const prompt = (Services as any).prompt
  const flags =
    prompt.BUTTON_POS_0 * prompt.BUTTON_TITLE_IS_STRING +
    prompt.BUTTON_POS_1 * prompt.BUTTON_TITLE_IS_STRING +
    prompt.BUTTON_POS_2 * prompt.BUTTON_TITLE_IS_STRING
  const selected = prompt.confirmEx(
    win,
    getString("duplicate-title"),
    getString("duplicate-body"),
    flags,
    getString("duplicate-overwrite"),
    getString("duplicate-new-version"),
    getString("duplicate-cancel"),
    null,
    { value: false },
  )
  if (selected === 0) {
    return { choice: "overwrite", overwriteItemKeys: existing.map((item) => item.key) }
  }
  if (selected === 1) return { choice: "version", overwriteItemKeys: [] }
  return null
}

// ── 主命令与配置 ─────────────────────────────────────────────────────────────

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

  // 对插件产物右键时,识别其来源任务并走「换管线重跑」。
  const sourceTask = loadTrackedTasks().find((task) =>
    task.attachedOutputs.some((output) => output.itemKey === att.key),
  )
  if (sourceTask) {
    if (win.confirm(getString("retry-other-pipeline-confirm"))) {
      await retryTrackedTask(sourceTask.jobId)
    }
    return
  }

  const opts = await openConfigDialog(win)
  if (!opts) return
  await runTranslation(win, att, opts)
}

async function openConfigDialog(win: Window): Promise<TranslateOptions | null> {
  const targetLanguage = getPref<string>("targetLanguage") || "zh-CN"
  const layoutMode = getPref<string>("layoutMode") || "reflow"
  const precisionMode = getPref<string>("precisionMode") || "high"
  const outputFormats = (getPref<string>("outputFormats") || "pdf")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
  const pipeline =
    layoutMode === "preserve"
      ? getString("dialog-pipeline-preserve")
      : getString("dialog-pipeline-reflow")
  const precision =
    precisionMode === "standard"
      ? getString("dialog-precision-standard")
      : getString("dialog-precision-high")
  const speed = automaticSpeedMode(layoutMode, precisionMode)
  const speedSummary =
    speed === "slow"
      ? getString("dialog-speed-auto-slow", { n: LARGE_DOCUMENT_MIN_PAGES })
      : getString("dialog-speed-realtime")
  let glossary = getString("dialog-glossary-unavailable")
  try {
    const list = await getGlossaries()
    glossary = getString("dialog-glossary-auto", { n: list.count })
  } catch {
    /* 术语读取失败不阻断翻译;后端仍按账户自动应用当前全量术语。 */
  }
  const summary =
    `${getString("dialog-title")}\n\n` +
    `${getString("dialog-target")}: ${targetLanguage}\n` +
    `${getString("dialog-pipeline")}: ${pipeline}\n` +
    `${getString("dialog-precision")}: ${precision}\n` +
    `${getString("dialog-speed")}: ${speedSummary}\n\n` +
    `${getString("dialog-glossary")}: ${glossary}\n\n` +
    getString("dialog-config-hint")
  if (!win.confirm(summary)) return null
  return {
    targetLanguage,
    layoutMode,
    precisionMode,
    bilingual: outputFormats.includes("pdf_bilingual"),
    outputFormats,
    speed,
  }
}

function makeProgress(): any {
  try {
    return new (ztk().ProgressWindow)(config.addonName, { closeOnClick: false })
  } catch {
    return {
      createLine() {
        return this
      },
      changeLine() {
        return this
      },
      show() {
        return this
      },
      startCloseTimer() {},
      close() {},
    }
  }
}

// ── 提交 / 恢复 / 轮询 ───────────────────────────────────────────────────────

async function runTranslation(
  win: Window,
  att: Zotero.Item,
  opts: TranslateOptions,
): Promise<void> {
  const maxConcurrent = getPref<number>("maxConcurrentTasks") || 3
  const activeCount = loadTrackedTasks().filter((task) => isActiveStatus(task.status)).length
  if (activeCount >= maxConcurrent) {
    win.alert(getString("concurrency-limit", { n: maxConcurrent }))
    return
  }
  const duplicate = chooseDuplicateMode(win, relatedTranslations(att, opts))
  if (!duplicate) return

  const origName = (att.attachmentFilename || "document.pdf").replace(/\.pdf$/i, "")
  const pw = makeProgress()
  pw.createLine({
    text: getString("progress-uploading"),
    type: "default",
    progress: 5,
  }).show()

  let bytes: Uint8Array
  try {
    bytes = await readBytes(att)
  } catch (error: any) {
    pw.changeLine({
      text: error?.message || getString("notify-failed", { name: origName }),
      type: "fail",
    })
    pw.startCloseTimer(4000)
    return
  }

  try {
    const account = await api.me()
    if (account.available <= 0) {
      pw.close()
      const topup = win.confirm(
        `${getString("dialog-insufficient", { b: account.available, n: "?" })}\n\n${getString("dialog-topup")}?`,
      )
      if (topup) {
        void emitTelemetry("click_topup")
        Zotero.launchURL(`${config.webBase}/billing?source=zotero_plugin`)
      }
      return
    }
  } catch (error) {
    logDebug(`preflight failed: ${error}`)
  }

  let job: Job
  try {
    job = await api.createTranslation(
      { name: `${origName}.pdf`, bytes, contentType: "application/pdf" },
      opts,
    )
  } catch (error: any) {
    const message =
      error instanceof ApiError
        ? error.message
        : getString("notify-failed", { name: origName })
    pw.changeLine({ text: message, type: "fail" })
    pw.startCloseTimer(5000)
    return
  }

  const task: TrackedTask = {
    jobId: job.id,
    sourceLibraryID: att.libraryID,
    sourceAttachmentKey: att.key,
    parentItemKey: att.parentItemKey || undefined,
    originalName: origName,
    options: opts,
    duplicateChoice: duplicate.choice,
    overwriteItemKeys: duplicate.overwriteItemKeys,
    status: job.status,
    progress: job.progress,
    error: job.error,
    submittedAt: job.created_at || new Date().toISOString(),
    attachedOutputs: [],
  }
  upsertTrackedTask(task)
  void emitTelemetry("task_submitted", job.id)
  refreshTaskPane()
  pw.changeLine({
    text: getString("progress-translating"),
    type: "default",
    progress: 20,
  })
  startPolling(job.id, pw, win)
}

function updateProgressWindow(pw: any, task: TrackedTask): void {
  if (task.progress !== null) {
    pw?.changeLine?.({ progress: Math.max(20, Math.min(95, task.progress)) })
  }
}

async function handleJob(job: Job, win?: Window, pw?: any): Promise<boolean> {
  const previous = getTrackedTask(job.id)
  const task = updateTrackedJob(job)
  if (!task) return true
  if (previous && isActiveStatus(previous.status)) {
    if (job.status === "succeeded") void emitTelemetry("task_completed", job.id)
    else if (job.status === "failed" || job.status === "canceled") {
      void emitTelemetry("task_failed", job.id)
    }
  }
  refreshTaskPane()
  updateProgressWindow(pw, task)

  if (job.status === "succeeded") {
    try {
      await finalizeTrackedTask(job.id)
      pw?.changeLine?.({
        text: getString("notify-done", { name: task.originalName }),
        type: "success",
        progress: 100,
      })
      if (getPref<boolean>("notifyOnComplete") !== false) {
        notify(win || mainWindow(), getString("notify-done", { name: task.originalName }))
      }
    } catch (error: any) {
      const latest = getTrackedTask(job.id)
      if (latest) {
        latest.attachError = error?.message || String(error)
        upsertTrackedTask(latest)
        refreshTaskPane()
      }
      pw?.changeLine?.({
        text: error?.message || getString("notify-failed", { name: task.originalName }),
        type: "fail",
      })
    }
    pw?.startCloseTimer?.(5000)
    return true
  }

  if (job.status === "failed" || job.status === "canceled") {
    pw?.changeLine?.({
      text: job.error || getString("notify-failed", { name: task.originalName }),
      type: "fail",
    })
    pw?.startCloseTimer?.(6000)
    return true
  }
  return false
}

function startPolling(jobId: string, pw?: any, win?: Window): void {
  const addon = (Zotero as any)[config.addonInstance]
  if (addon?.data.activePolls.has(jobId)) return
  let stopped = false
  addon?.data.activePolls.set(jobId, () => {
    stopped = true
  })

  void (async () => {
    try {
      while (!stopped) {
        let job: Job
        try {
          job = await api.getJob(jobId)
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            ;(win || mainWindow())?.alert(getString("session-expired"))
            return
          }
          await Zotero.Promise.delay(POLL_INTERVAL_MS)
          continue
        }
        if (await handleJob(job, win, pw)) return
        await Zotero.Promise.delay(POLL_INTERVAL_MS)
      }
    } finally {
      addon?.data.activePolls.delete(jobId)
    }
  })()
}

export async function refreshTrackedTasks(): Promise<void> {
  if (!isLoggedIn()) {
    refreshTaskPane()
    return
  }
  const tracked = loadTrackedTasks()
  if (!tracked.length) {
    refreshTaskPane()
    return
  }

  let listed = new Map<string, Job>()
  try {
    const response = await api.listJobs(0, 50)
    listed = new Map(response.data.map((job) => [job.id, job]))
  } catch (error) {
    logDebug(`restore task list failed: ${error}`)
  }

  for (const task of tracked) {
    if (task.attachedAt || task.status === "failed" || task.status === "canceled") continue
    let job = listed.get(task.jobId)
    if (!job) {
      try {
        job = await api.getJob(task.jobId)
      } catch {
        continue
      }
    }
    const terminal = await handleJob(job)
    if (!terminal && isActiveStatus(job.status)) startPolling(job.id)
  }
  refreshTaskPane()
}

export async function resumeTrackedTasks(): Promise<void> {
  await refreshTrackedTasks()
}

// ── 回填 / 命名 / note ───────────────────────────────────────────────────────

function selectOutputs(outputs: OutputItem[], options: TranslateOptions): OutputItem[] {
  const requested = options.outputFormats?.length
    ? options.outputFormats
    : options.bilingual
      ? ["pdf_bilingual"]
      : ["pdf"]
  const selected = outputs.filter((output) => requested.includes(output.format))
  return selected.length ? selected : outputs.slice(0, 1)
}

async function downloadOutput(jobId: string, format: string): Promise<Uint8Array> {
  const download = await api.getDownloadUrl(jobId, format)
  const urls = [download.url, download.proxy_url].filter((url): url is string => !!url)
  let lastError: unknown
  for (const url of urls) {
    try {
      const response: any = await Zotero.HTTP.request("GET", url, withPluginIdentity(url, {
        responseType: "arraybuffer",
      }))
      return new Uint8Array(response.response)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error(getString("output-download-failed"))
}

function siblingAttachmentNames(source: Zotero.Item): string[] {
  const parent = source.parentItem
  if (!parent) return []
  return Zotero.Items.get(parent.getAttachments())
    .filter((item) => item.isAttachment())
    .map((item) => item.attachmentFilename || "")
}

async function importOutput(
  task: TrackedTask,
  source: Zotero.Item,
  output: OutputItem,
): Promise<string> {
  const bytes = await downloadOutput(task.jobId, output.format)
  const baseName = outputBaseName(task.originalName, output.format, task.options.targetLanguage)
  const version =
    task.duplicateChoice === "version"
      ? nextVersion(baseName, siblingAttachmentNames(source))
      : 1
  const filename = addVersionSuffix(baseName, version)
  const tmpDir = (globalThis as any).PathUtils.join(
    Zotero.getTempDirectory().path,
    `geyi-${task.jobId}`,
  )
  const tmpPath = (globalThis as any).PathUtils.join(tmpDir, filename)

  await (globalThis as any).IOUtils.makeDirectory(tmpDir, { ignoreExisting: true })
  await (globalThis as any).IOUtils.write(tmpPath, bytes)
  try {
    const importOptions: Parameters<typeof Zotero.Attachments.importFromFile>[0] = {
      file: tmpPath,
      title: filename,
    }
    if (source.parentItemID) importOptions.parentItemID = source.parentItemID
    else importOptions.libraryID = source.libraryID
    const attachment = await Zotero.Attachments.importFromFile(importOptions)
    attachment.addTag("格译-译文")
    attachment.addTag(pipelineTag(task.options.layoutMode))
    await attachment.saveTx()
    return attachment.key
  } finally {
    try {
      await (globalThis as any).IOUtils.remove(tmpPath)
      await (globalThis as any).IOUtils.remove(tmpDir)
    } catch {
      /* 临时文件清理失败不影响结果 */
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

async function createTaskNote(task: TrackedTask, source: Zotero.Item): Promise<string | undefined> {
  if (getPref<boolean>("autoNote") === false || !source.parentItemID) return undefined
  const note = new Zotero.Item("note")
  note.libraryID = source.libraryID
  note.parentItemID = source.parentItemID
  const pipeline =
    task.options.layoutMode === "preserve"
      ? getString("dialog-pipeline-preserve")
      : getString("dialog-pipeline-reflow")
  note.setNote(
    `<h2>${escapeHtml(task.originalName)}</h2>` +
      `<p>${escapeHtml(getString("note-pipeline"))}: ${escapeHtml(pipeline)}</p>` +
      `<p>${escapeHtml(getString("note-task-id"))}: ${escapeHtml(task.jobId)}</p>` +
      `<p>${escapeHtml(getString("note-created-at"))}: ${escapeHtml(new Date().toLocaleString())}</p>`,
  )
  await note.saveTx()
  return note.key
}

async function finalizeTrackedTask(jobId: string): Promise<void> {
  if (finalizingJobs.has(jobId)) return
  const initial = getTrackedTask(jobId)
  if (!initial || initial.attachedAt) return
  finalizingJobs.add(jobId)
  try {
    const source = await getItemByKey(initial.sourceLibraryID, initial.sourceAttachmentKey)
    if (!source) throw new Error(getString("source-attachment-missing"))
    const result = await api.listOutputs(jobId)
    const selected = selectOutputs(result.outputs, initial.options)
    if (!selected.length) throw new Error(getString("output-missing"))

    let task = getTrackedTask(jobId) || initial
    for (const output of selected) {
      if (task.attachedOutputs.some((item) => item.format === output.format)) continue
      const itemKey = await importOutput(task, source, output)
      task = {
        ...task,
        attachError: undefined,
        attachedOutputs: [...task.attachedOutputs, { format: output.format, itemKey }],
      }
      upsertTrackedTask(task)
      refreshTaskPane()
    }

    if (task.duplicateChoice === "overwrite" && task.overwriteItemKeys.length) {
      const ids: number[] = []
      for (const key of task.overwriteItemKeys) {
        const oldItem = await getItemByKey(task.sourceLibraryID, key)
        if (oldItem && !task.attachedOutputs.some((output) => output.itemKey === key)) {
          ids.push(oldItem.id)
        }
      }
      if (ids.length) await Zotero.Items.trashTx(ids)
    }

    if (!task.noteItemKey) {
      const noteItemKey = await createTaskNote(task, source)
      if (noteItemKey) task = { ...task, noteItemKey }
    }
    task = {
      ...task,
      attachError: undefined,
      attachedAt: new Date().toISOString(),
    }
    upsertTrackedTask(task)
    refreshTaskPane()
  } finally {
    finalizingJobs.delete(jobId)
  }
}

// ── 失败操作 ─────────────────────────────────────────────────────────────────

export async function retryTrackedTask(jobId: string): Promise<void> {
  const task = getTrackedTask(jobId)
  if (!task) return
  if (task.status === "succeeded" && !task.attachedAt) {
    await finalizeTrackedTask(jobId)
    return
  }
  const source = await getItemByKey(task.sourceLibraryID, task.sourceAttachmentKey)
  const win = mainWindow()
  if (!source || !win) {
    win?.alert(getString("source-attachment-missing"))
    return
  }
  const nextLayoutMode =
    task.options.layoutMode === "preserve" ? "reflow" : "preserve"
  const nextOptions: TranslateOptions = {
    ...task.options,
    layoutMode: nextLayoutMode,
    speed: automaticSpeedMode(nextLayoutMode, task.options.precisionMode),
  }
  await runTranslation(win, source, nextOptions)
}

export function reportTrackedTask(jobId: string): void {
  void emitTelemetry("click_ticket", jobId)
  const source = encodeURIComponent(`Zotero Plugin ${config.version}`)
  Zotero.launchURL(`${config.webBase}/tickets?task_id=${encodeURIComponent(jobId)}&source=${source}`)
}

function notify(win: Window | undefined, text: string): void {
  if (!win) return
  try {
    if (!(win as any).document.hasFocus?.()) {
      new (win as any).Notification(config.addonName, { body: text })
    }
  } catch {
    /* 系统通知不可用即忽略 */
  }
}
