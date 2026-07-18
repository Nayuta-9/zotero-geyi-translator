import { config } from "./utils/config"
import { registerAuthEndpoint } from "./modules/server"
import { onPrefsPaneLoad, registerPrefsPane } from "./modules/prefsPane"
import { registerMenus, unregisterMenus } from "./modules/translate"

// 生命周期(GEYI-328)。bootstrap.js 直接调用这些。

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    (Zotero as any).uiReadyPromise,
  ])

  registerAuthEndpoint()
  await registerPrefsPane()

  for (const win of Zotero.getMainWindows()) {
    onMainWindowLoad(win as unknown as Window)
  }
}

function onMainWindowLoad(win: Window) {
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
