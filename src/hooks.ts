import { config } from "./utils/config"
import { onPrefsPaneLoad, registerPrefsPane } from "./modules/prefsPane"
import { registerTaskPane, unregisterTaskPane } from "./modules/taskPane"
import {
  refreshTrackedTasks,
  registerMenus,
  reportTrackedTask,
  resumeTrackedTasks,
  retryTrackedTask,
  unregisterMenus,
} from "./modules/translate"
import { emitInstallOnce } from "./modules/telemetry"

// 生命周期(GEYI-328)。bootstrap.js 直接调用这些。

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    (Zotero as any).uiReadyPromise,
  ])

  await registerPrefsPane()

  for (const win of Zotero.getMainWindows()) {
    onMainWindowLoad(win as unknown as Window)
  }
  registerTaskPane({
    refresh: refreshTrackedTasks,
    retry: retryTrackedTask,
    report: reportTrackedTask,
  })
  void emitInstallOnce()
  await resumeTrackedTasks()
}

function onMainWindowLoad(win: Window) {
  try {
    // scaffold 会给 Fluent 文件名加插件命名空间:geyi.ftl → geyi-geyi.ftl。
    ;(win as any).MozXULElement?.insertFTLIfNeeded?.("geyi-geyi.ftl")
  } catch {
    /* 本地化资源加载失败时仍保留功能 */
  }
  registerMenus(win)
}

function onMainWindowUnload(win: Window) {
  unregisterMenus(win)
}

function onShutdown() {
  const addon = (Zotero as any)[config.addonInstance]
  try {
    addon?.data.activePolls.forEach((stop: () => void) => stop())
    addon?.data.activePolls.clear()
  } catch {
    /* ignore */
  }
  try {
    unregisterTaskPane()
  } catch {
    /* ignore */
  }
  for (const win of Zotero.getMainWindows()) {
    try {
      ;(win as unknown as Window).document
        .querySelector('link[href="geyi-geyi.ftl"]')
        ?.remove()
    } catch {
      /* ignore */
    }
  }
  // 注销设置面板,避免覆盖安装后残留旧面板(截图里的重复「Geyi Translator」)。
  try {
    const paneID = addon?.data?.prefsPaneID
    if (paneID) (Zotero as any).PreferencePanes.unregister(paneID)
  } catch {
    /* ignore */
  }
  try {
    addon?.data.ztoolkit?.unregisterAll?.()
  } catch {
    /* ignore */
  }
  if (addon?.data) addon.data.alive = false
  delete (Zotero as any)[config.addonInstance]
}

// 由 content/prefsPane-init.js 在设置面板 load 时调用(桥接 bundle 内逻辑)。
function onPrefsLoad(win: Window) {
  onPrefsPaneLoad(win)
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onPrefsLoad,
}
