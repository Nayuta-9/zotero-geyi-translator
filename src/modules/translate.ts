import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { getPref } from "../utils/prefs"
import { withPluginIdentity } from "../utils/http"
import { logDebug } from "../utils/log"
import { api, ApiError, type Job, type OutputItem, type TranslateOptions } from "../utils/api"
import { accountLabel } from "./accountNotice"
import { isLoggedIn, showLoginFailure, startLogin } from "./auth"
import { getGlossaries } from "./glossary"
import { refreshTaskPane } from "./taskPane"
import { emitTelemetry } from "./telemetry"
import {
  getAccountSnapshot,
  hasFeature,
  MEMBER_FEATURE,
  type AccountSnapshot,
} from "./memberFeatures"
import {
  LARGE_DOCUMENT_MIN_PAGES,
  resolveConcurrencyCap,
  resolveOutputs,
  resolveSpeedMode,
  resolveSubmission,
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
  let signedInHere = false
  if (!isLoggedIn()) {
    const go = win.confirm(
      `${getString("login-required-title")}\n\n${getString("login-required-body")}`,
    )
    if (!go) return
    try {
      await startLogin({ win })
    } catch (error) {
      showLoginFailure(win, error)
      return
    }
    signedInHere = true
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

  const opts = await openConfigDialog(win, signedInHere)
  if (!opts) return
  await runTranslation(win, att, opts)
}

/**
 * Confirms the translation settings. With `showAccount`, the account is read
 * fresh and the summary names it, so a user who has just signed in sees which
 * account the PDF goes to before confirming.
 */
export async function openConfigDialog(
  win: Window,
  showAccount = false,
): Promise<TranslateOptions | null> {
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
  // 处理档是用户在设置页显式选的(GEYI-422),这里只负责**展示**它最终会变成什么。
  // 真正决定提交值的解算在 runTranslation 入口 —— 那是本对话框与「换管线重跑」
  // 两条提交路径唯一的汇合点,只在这里算会漏掉重试路径。
  const requestedSpeed = getPref<string>("speedMode") || "fast"
  const snapshot = await getAccountSnapshot(showAccount)
  const preview = resolveSpeedMode(requestedSpeed, layoutMode, precisionMode, {
    batchSlow: hasFeature(snapshot, MEMBER_FEATURE.BATCH_SLOW),
  })
  const speedSummary =
    preview.downgraded === "entitlement"
      ? getString("dialog-speed-locked")
      : preview.downgraded === "shape"
        ? getString("dialog-speed-inapplicable")
        : preview.speed === "slow"
          ? getString("dialog-speed-slow", { n: LARGE_DOCUMENT_MIN_PAGES })
          : getString("dialog-speed-realtime")
  const outputPreview = resolveOutputs(outputFormats, {
    bilingual: hasFeature(snapshot, MEMBER_FEATURE.BILINGUAL),
  })
  let glossary = getString("dialog-glossary-unavailable")
  try {
    const list = await getGlossaries()
    glossary = getString("dialog-glossary-auto", { n: list.count })
  } catch {
    /* 术语读取失败不阻断翻译;后端仍按账户自动应用当前全量术语。 */
  }
  // 被权益挡下的选项在摘要里明说,别让用户以为自己选的那档生效了。
  const downgrades = [
    preview.downgraded === "entitlement" ? getString("dialog-downgraded-speed") : "",
    outputPreview.downgraded === "entitlement"
      ? getString("dialog-downgraded-bilingual")
      : "",
  ].filter(Boolean)
  const summary =
    `${getString("dialog-title")}\n\n` +
    (showAccount ? `${getString("dialog-account")}: ${accountLabel(snapshot)}\n` : "") +
    `${getString("dialog-target")}: ${targetLanguage}\n` +
    `${getString("dialog-pipeline")}: ${pipeline}\n` +
    `${getString("dialog-precision")}: ${precision}\n` +
    `${getString("dialog-speed")}: ${speedSummary}\n\n` +
    `${getString("dialog-glossary")}: ${glossary}\n` +
    (downgrades.length ? `\n${downgrades.join("\n")}\n` : "") +
    `\n${getString("dialog-config-hint")}`
  if (!win.confirm(summary)) return null
  // speed 这里回填的是**用户选择的原始值**,不是上面算出的预览值 —— 解算权威在
  // runTranslation,预览只是给人看的。两者若因缓存过期而不同,以入口的强刷为准。
  return {
    targetLanguage,
    layoutMode,
    precisionMode,
    bilingual: outputFormats.includes("pdf_bilingual"),
    outputFormats,
    speed: requestedSpeed as TranslateOptions["speed"],
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
  // 账户快照必须在这里、在任何判断之前取一次强刷的(GEYI-422):并发上限、权益降级、
  // 余额预检三件事都读它,而且强刷保证「刚在网页升了级,回来就能用」。
  // 这里也是右键翻译与「换管线重跑」两条提交路径唯一的汇合点 —— 解算只能放这儿。
  const snapshot = await getAccountSnapshot(true)
  if (snapshot.state === "expired") {
    const upgrade = win.confirm(
      `${getString("membership-required")}\n\n${getString("dialog-upgrade")}?`,
    )
    if (upgrade) {
      void emitTelemetry("click_upgrade")
      Zotero.launchURL(`${config.webBase}/billing?source=zotero_plugin`)
    }
    return
  }
  const submission = resolveSubmission(opts, {
    batchSlow: hasFeature(snapshot, MEMBER_FEATURE.BATCH_SLOW),
    bilingual: hasFeature(snapshot, MEMBER_FEATURE.BILINGUAL),
  })
  const effectiveOpts: TranslateOptions = {
    ...opts,
    speed: submission.speed,
    bilingual: submission.bilingual,
    outputFormats: submission.outputFormats,
  }
  for (const d of submission.downgrades) {
    logDebug(`submission downgraded: ${d.field} (${d.reason})`)
  }

  const maxConcurrent = resolveConcurrencyCap(
    getPref<number>("maxConcurrentTasks"),
    snapshot.account?.concurrent_translate_limit ?? undefined,
  )
  const activeCount = loadTrackedTasks().filter((task) => isActiveStatus(task.status)).length
  if (activeCount >= maxConcurrent) {
    win.alert(getString("concurrency-limit", { n: maxConcurrent }))
    return
  }
  const duplicate = chooseDuplicateMode(win, relatedTranslations(att, effectiveOpts))
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

  // 余额预检复用上面那次强刷的快照,不再单独打一次 /v1/me。快照取不到(离线)时
  // 跳过预检直接提交 —— 与改动前 catch 掉的行为一致,后端仍是权威。
  const account = snapshot.account
  if (account && account.available <= 0) {
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

  let job: Job
  try {
    job = await api.createTranslation(
      { name: `${origName}.pdf`, bytes, contentType: "application/pdf" },
      effectiveOpts,
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
    // 记的是**实际提交值**而不是用户原始选择:产物回填、重复检测、任务面板都按它
    // 对号,记原始值会与后端实际产出的东西对不上。
    options: effectiveOpts,
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
  // GEYI-645:任务已入库、面板已接管 → 浮窗到此为止。
  //
  // 改之前浮窗全程悬在主窗右下角:`closeOnClick: false`,而 `startCloseTimer`
  // 只在终态才调,于是一次十几分钟的翻译就悬十几分钟 —— 而同一份状态(进度百分
  // 比、状态文案、错误文案)条目面板里每 3 秒刷一次,一样不少,还多出重试/报障
  // 按钮。GEYI-618 已查清浮窗是 Zotero 平台的独立 chrome 窗口
  // (`chrome://zotero/content/progressWindow.xhtml`,`alwaysontop=yes`),位置由
  // `ProgressWindowSet.tile()` 钉死,插件改不了它的位置和尺寸 —— 所以方向不是
  // 「挪走」,是「让它早点关」。
  //
  // 文案换成「已提交」而不是留着「翻译中…」:窗口马上要消失,留一句「翻译中」
  // 会让人以为翻译被取消了。这句话同时把「去哪儿看进度」说清楚。
  pw.changeLine({
    text: getString("progress-submitted"),
    type: "success",
    progress: 20,
  })
  closeSubmitProgress(pw)
  // **不再把 pw 交给轮询**。这是本票风险点(「窗口关掉之后再 changeLine 有踩空
  // 的风险」)的处理方式:与其在下游到处判窗口还在不在,不如根本不把它传下去 ——
  // handleJob / updateProgressWindow 里那些 `pw?.` 于是结构性地成为 no-op。
  //
  // 顺带修掉一个真实的小泄漏:Zotero 的 `close()` 会把 `_windowLoaded` 置回
  // false,此后 `setText`/`setProgress` 既不抛也不渲染,而是被
  // `_deferUntilWindowLoad` 静默推进一个**永远不会 flush** 的数组(本插件不会
  // 再 show 第二次)。按 3 秒一轮,十分钟攒约 200 条。
  startPolling(job.id, win)
}

// 提交阶段那个浮窗的收尾。
//
// 两道一起上是有原因的:
// 1. `startCloseTimer` 是 Zotero 自己的关闭流程,鼠标划过主窗时
//    `_onMouseOver` 会 `_disableTimeout()` 把它取消掉 —— 用户手正好在窗口上,
//    浮窗就又不走了,而本票要的恰恰是「无论如何别一直悬着」。
// 2. 所以再加一道兜底 `close()`。用 `Zotero.Promise.delay` 而不是 `setTimeout`:
//    本仓一贯用它(轮询就是),模块作用域里没有可靠的 `setTimeout`。
//
// 另:`startCloseTimer` 必须在窗口 **load 完之后**调才有效(底层 `_windowLoading`
// 时挂的 timer 会随 about:blank 那个 inner window 一起被 Gecko 丢掉 —— 这正是
// `show()` 里那次隐含的 5 秒定时器从来没生效过的原因)。这里的调用点在
// `readBytes` 与 `createTranslation` 两次 await 之后,窗口早已 load 完。
const SUBMIT_PROGRESS_CLOSE_MS = 2500

function closeSubmitProgress(pw: any): void {
  try {
    pw?.startCloseTimer?.(SUBMIT_PROGRESS_CLOSE_MS)
  } catch {
    /* 关不掉不该影响任务本身 */
  }
  void Zotero.Promise.delay(SUBMIT_PROGRESS_CLOSE_MS + 500).then(() => {
    try {
      pw?.close?.()
    } catch {
      /* 已经关了 / 窗口已销毁 */
    }
  })
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
    // GEYI-645:浮窗在提交阶段就关掉了,失败终态原先那条浮窗提示于是没人看得见。
    // 成功侧一直有系统通知兜着(上面那段),失败侧此前没有 —— 不补的话这一票会
    // 让**失败反而比成功更不可见**,那是个货真价实的倒退。用同一个
    // `notifyOnComplete` 开关:关掉通知的人两种终态都不想被打扰。
    if (getPref<boolean>("notifyOnComplete") !== false) {
      notify(
        win || mainWindow(),
        job.error || getString("notify-failed", { name: task.originalName }),
      )
    }
    return true
  }
  return false
}

function startPolling(jobId: string, win?: Window): void {
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
        if (await handleJob(job, win)) return
        await Zotero.Promise.delay(POLL_INTERVAL_MS)
      }
    } catch (error) {
      // GEYI-645:这里原先只有 try/finally,没有 catch。handleJob 里任何一步抛
      // 出来(它要碰 UI、要写库、要挂产物),整条轮询就静默死掉、finally 清掉
      // activePolls,任务从此永远不再回填 —— 用户看到的是「翻译中」停在那儿。
      // 本票动了 handleJob 的终态分支,顺手把这条防线补上:UI 层的意外不该吃掉
      // 产物回填。
      Zotero.logError(error as Error)
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
  // speed 取用户**当前**设置而不是这个任务上次提交的值:上次可能因为权益不足被降级
  // 成 fast,如果照抄,用户升级会员之后重试仍然拿不到慢速档。真正的解算在
  // runTranslation 入口统一做,这里只负责把「用户此刻想要什么」喂进去。
  const nextOptions: TranslateOptions = {
    ...task.options,
    layoutMode: nextLayoutMode,
    speed: (getPref<string>("speedMode") || "fast") as TranslateOptions["speed"],
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
