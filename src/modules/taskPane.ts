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

export function registerTaskPane(actions: TaskPaneActions): void {
  paneActions = actions
  if (registeredPaneID) return
  const registered = Zotero.ItemPaneManager.registerSection({
    paneID: PANE_ID,
    pluginID: config.addonID,
    header: {
      l10nID: "geyi-item-pane-tasks",
      icon: `chrome://${config.addonRef}/content/icons/icon.svg`,
    },
    sidenav: {
      l10nID: "geyi-item-pane-tasks",
      icon: `chrome://${config.addonRef}/content/icons/icon.svg`,
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
