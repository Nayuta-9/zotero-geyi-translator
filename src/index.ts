import { config } from "./utils/config"
import { Addon } from "./addon"

// 入口(GEYI-328):由 bootstrap.js loadSubScript 加载。把插件单例挂到
// Zotero.<addonInstance> 供 bootstrap 生命周期回调访问。
const instanceKey = config.addonInstance as "GeyiTranslator"

if (!(Zotero as any)[instanceKey]) {
  const addon = new Addon()
  ;(Zotero as any)[instanceKey] = addon
  // 便于 dogfood 时在控制台访问。
  ;(globalThis as any).ztoolkit = addon.data.ztoolkit
}
