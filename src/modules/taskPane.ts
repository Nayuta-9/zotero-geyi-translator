import { config } from "../utils/config"
import { getString } from "../utils/locale"
import { isActiveStatus, loadTrackedTasks, type TrackedTask } from "./taskState"

const PANE_ID = `${config.addonRef}-tasks`
const renderedBodies = new Set<HTMLDivElement>()
let registeredPaneID: string | undefined

export interface TaskPaneActions {
  refresh(): Promise<void>
  retry(jobId: string): Promise<void>
  report(jobId: string): void
}

let paneActions: TaskPaneActions | undefined

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag)
  if (text !== undefined) node.textContent = text
  return node
}

function statusLabel(task: TrackedTask): string {
  if (task.attachedAt) return getString("task-status-attached")
  if (task.status === "succeeded" && task.attachError) {
    return getString("task-status-attach-failed")
  }
  return getString(`task-status-${task.status}`)
}

function renderTask(body: HTMLDivElement, task: TrackedTask): void {
  const doc = body.ownerDocument
  const card = el(doc, "div")
  card.style.cssText =
    "padding:8px 0;border-bottom:1px solid var(--fill-quinary,#ddd);display:flex;flex-direction:column;gap:5px;"

  const title = el(doc, "div", task.originalName)
  title.style.cssText = "font-weight:600;overflow-wrap:anywhere;"
  card.append(title)

  const status = el(doc, "div", statusLabel(task))
  status.style.cssText = "font-size:0.9em;color:var(--fill-secondary,#666);"
  card.append(status)

  if (isActiveStatus(task.status)) {
    const progress = el(doc, "progress")
    progress.max = 100
    if (task.progress !== null) progress.value = task.progress
    progress.style.width = "100%"
    card.append(progress)
  }

  if (task.error || task.attachError) {
    const error = el(doc, "div", task.error || task.attachError)
    error.style.cssText = "color:var(--color-red-70,#b42318);overflow-wrap:anywhere;"
    card.append(error)
  }

  if (task.status === "failed" || task.status === "canceled" || task.attachError) {
    const actions = el(doc, "div")
    actions.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;"

    const retry = el(doc, "button", getString("task-retry-other-pipeline"))
    retry.type = "button"
    retry.addEventListener("click", () => void paneActions?.retry(task.jobId))
    actions.append(retry)

    const report = el(doc, "button", getString("task-report"))
    report.type = "button"
    report.addEventListener("click", () => paneActions?.report(task.jobId))
    actions.append(report)
    card.append(actions)
  }

  body.append(card)
}

function renderBody(body: HTMLDivElement): void {
  body.replaceChildren()
  body.style.padding = "0 8px 8px"
  const doc = body.ownerDocument
  const tasks = loadTrackedTasks().slice(0, 20)

  const toolbar = el(doc, "div")
  toolbar.style.cssText = "display:flex;justify-content:flex-end;padding:4px 0;"
  const refresh = el(doc, "button", getString("task-refresh"))
  refresh.type = "button"
  refresh.addEventListener("click", () => void paneActions?.refresh())
  toolbar.append(refresh)
  body.append(toolbar)

  if (!tasks.length) {
    const empty = el(doc, "div", getString("task-empty"))
    empty.style.cssText = "padding:8px 0;color:var(--fill-secondary,#666);"
    body.append(empty)
    return
  }
  for (const task of tasks) renderTask(body, task)
}

// GEYI-618：header 与 sidenav 的两条 l10n 消息必须分开、且**只能带属性不能带值**。
//
// Zotero 把 header.l10nID 挂到 <collapsible-section> 上、把 sidenav.l10nID 挂到侧栏那个
// 28×28 的按钮上。Fluent 一旦发现消息带值,就用这个值覆写整个元素的 textContent:
//   · 面板侧 → 标题栏与整块 body 被一句纯文本顶掉,插件内容全部消失(只剩一行「格译任务」);
//   · 侧栏侧 → 按钮里多出一行文字,在 28px 宽度里逐字换行,竖着压在图标上。
// 两处正是 GEYI-618 截图里的重叠。标题文字走 .label(Zotero 读它填 section 标题),
// 侧栏按钮走 .tooltiptext —— 与 Zotero 自带的 section-* / sidenav-* 消息同一写法。
//
// 图标同理要按槽位给尺寸:两个槽位都用 CSS background 画图且没设 background-size,
// 图片按自身固有尺寸绘制并被元素裁掉。标题图标的格子是 16×16、侧栏按钮是 28×28
// (Zotero 自带图标 20×20),所以塞一张 32×32 的进去只会被裁一圈、还明显大过邻居。
export function registerTaskPane(actions: TaskPaneActions): void {
  paneActions = actions
  if (registeredPaneID) return
  const registered = Zotero.ItemPaneManager.registerSection({
    paneID: PANE_ID,
    pluginID: config.addonID,
    header: {
      l10nID: "geyi-item-pane-tasks",
      icon: `chrome://${config.addonRef}/content/icons/icon-16.svg`,
    },
    sidenav: {
      l10nID: "geyi-item-pane-tasks-sidenav",
      icon: `chrome://${config.addonRef}/content/icons/icon-20.svg`,
    },
    onRender: ({ body }) => {
      renderedBodies.add(body)
      renderBody(body)
    },
    onItemChange: ({ body }) => renderBody(body),
    onDestroy: ({ body }) => renderedBodies.delete(body),
  })
  if (registered) registeredPaneID = registered
}

export function refreshTaskPane(): void {
  for (const body of renderedBodies) renderBody(body)
}

export function unregisterTaskPane(): void {
  if (registeredPaneID) Zotero.ItemPaneManager.unregisterSection(registeredPaneID)
  registeredPaneID = undefined
  renderedBodies.clear()
  paneActions = undefined
}
