import { ZoteroToolkit } from "zotero-plugin-toolkit"
import hooks from "./hooks"

// 插件单例(GEYI-328):持有 ztoolkit 与运行期状态,生命周期转交 hooks。
// bootstrap.js 通过 Zotero.GeyiTranslator(=__addonInstance__)访问本实例。
export class Addon {
  public data: {
    alive: boolean
    ztoolkit: ZoteroToolkit
    prefsPaneID?: string
    // 进行中的轮询 taskId → 停止函数,shutdown 时清理。
    activePolls: Map<string, () => void>
  }
  public hooks: typeof hooks

  constructor() {
    this.data = {
      alive: true,
      ztoolkit: new ZoteroToolkit(),
      activePolls: new Map(),
    }
    this.hooks = hooks
  }
}
