import { config } from "../utils/config"
import { withPluginIdentity } from "../utils/http"
import { logDebug } from "../utils/log"
import { getPref, setPref } from "../utils/prefs"

export type PluginEvent =
  | "install"
  | "login_success"
  | "task_submitted"
  | "task_completed"
  | "task_failed"
  | "click_ticket"
  | "click_topup"

/**
 * 复用现有健康端点留下 UA + 事件查询参数,无需建立平行插件 API。
 * 这是 best-effort 遥测:任何失败都不能阻断登录/翻译/跳转。
 */
export async function emitTelemetry(event: PluginEvent, jobId?: string): Promise<void> {
  const params = new URLSearchParams({ event, source: "zotero_plugin" })
  if (jobId) params.set("task_id", jobId)
  const url = `${config.authApiBase}/health?${params.toString()}`
  try {
    await Zotero.HTTP.request(
      "GET",
      url,
      withPluginIdentity(url, {
        responseType: "text",
        headers: { "X-Geyi-Event": event },
      }),
    )
  } catch (error) {
    logDebug(`telemetry ${event} failed: ${error}`)
  }
}

export async function emitInstallOnce(): Promise<void> {
  if (getPref<boolean>("installTelemetrySent")) return
  await emitTelemetry("install")
  // 即使网络失败也不在每次启动反复打点;后续真实登录/任务请求仍能识别插件流量。
  setPref("installTelemetrySent", true)
}
